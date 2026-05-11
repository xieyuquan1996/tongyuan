// backend/src/gateway/biller.ts
import { eq, sql } from 'drizzle-orm'
import { db, pool } from '../db/client.js'
import { users, requestLogs, billingLedger } from '../db/schema.js'
import { gatewayRequests, gatewayLatency, billingUsdConsumed } from '../observability/metrics.js'
import { checkBillingAlerts } from '../services/alert-notifier.js'
import { AppError } from '../shared/errors.js'

export type CommitInput = {
  id: string
  userId: string
  apiKeyId: string
  upstreamKeyId: string | null
  model: string
  upstreamModel: string
  endpoint: string
  stream: boolean
  status: number
  errorCode: string | null
  latencyMs: number
  ttfbMs: number | null
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cacheWrite1hTokens: number
  chargeUsd: string
  costUsd: string
  requestHash: string
  upstreamRequestHash: string
  auditMatch: boolean
  idempotencyKey: string | null
  balanceHoldUsd: string  // 入场时已预扣的金额；'0' 退化为原有直接扣款行为
}

// 原子预扣余额。WHERE balance >= hold 保证并发安全：
// 若余额不足（0 行受影响），抛 insufficient_balance。
export async function holdBalance(userId: string, holdUsd: string): Promise<void> {
  const { rowCount } = await pool.query(
    `UPDATE users
     SET balance_usd = balance_usd - $1, updated_at = NOW()
     WHERE id = $2 AND balance_usd >= $1`,
    [holdUsd, userId],
  )
  if (!rowCount || rowCount === 0) throw new AppError('insufficient_balance')
}

// 退还 hold。用于 commitRequest 没机会跑（异常或崩溃）时兜底；
// 正常路径下 commitRequest 内部已经做了调平，不会调到这里。
export async function refundHold(userId: string, holdUsd: string): Promise<void> {
  await pool.query(
    `UPDATE users SET balance_usd = balance_usd + $1, updated_at = NOW() WHERE id = $2`,
    [holdUsd, userId],
  )
}

export async function commitRequest(input: CommitInput): Promise<void> {
  const holdUsd   = Number(input.balanceHoldUsd)
  const chargeUsd = Number(input.chargeUsd)

  await db.transaction(async (tx) => {
    await tx.insert(requestLogs).values({
      id: input.id,
      userId: input.userId,
      apiKeyId: input.apiKeyId,
      upstreamKeyId: input.upstreamKeyId,
      model: input.model,
      upstreamModel: input.upstreamModel,
      endpoint: input.endpoint,
      stream: input.stream,
      status: String(input.status),
      errorCode: input.errorCode,
      latencyMs: String(input.latencyMs),
      ttfbMs: input.ttfbMs !== null ? String(input.ttfbMs) : null,
      inputTokens: String(input.inputTokens),
      outputTokens: String(input.outputTokens),
      cacheReadTokens: String(input.cacheReadTokens),
      cacheWriteTokens: String(input.cacheWriteTokens),
      cacheWrite1hTokens: String(input.cacheWrite1hTokens),
      costUsd: input.costUsd,
      requestHash: input.requestHash,
      upstreamRequestHash: input.upstreamRequestHash,
      auditMatch: input.auditMatch,
      idempotencyKey: input.idempotencyKey,
    })

    if (holdUsd > 0) {
      // 有预扣：调平 balance += (hold - actual)。
      // hold 已在入场时扣除，此处只修正差额（退回超估或追扣不足）。
      const delta = (holdUsd - chargeUsd).toFixed(6)
      const [u] = await tx.update(users)
        .set({ balanceUsd: sql`${users.balanceUsd} + ${delta}`, updatedAt: new Date() })
        .where(eq(users.id, input.userId))
        .returning({ balanceUsd: users.balanceUsd })

      if (chargeUsd > 0) {
        await tx.insert(billingLedger).values({
          userId: input.userId,
          requestLogId: input.id,
          kind: 'debit_usage',
          amountUsd: '-' + input.chargeUsd,
          balanceAfterUsd: u!.balanceUsd,
          note: `${input.model} ${input.inputTokens}+${input.outputTokens}t`,
        })
      }
    } else if (chargeUsd > 0) {
      // 无预扣（向后兼容）：直接扣款
      const [u] = await tx.update(users)
        .set({ balanceUsd: sql`${users.balanceUsd} - ${input.chargeUsd}`, updatedAt: new Date() })
        .where(eq(users.id, input.userId))
        .returning({ balanceUsd: users.balanceUsd })

      await tx.insert(billingLedger).values({
        userId: input.userId,
        requestLogId: input.id,
        kind: 'debit_usage',
        amountUsd: '-' + input.chargeUsd,
        balanceAfterUsd: u!.balanceUsd,
        note: `${input.model} ${input.inputTokens}+${input.outputTokens}t`,
      })
    }
  })

  // Metrics are best-effort and live outside the transaction.
  gatewayRequests.inc({ model: input.model, status: String(input.status) })
  gatewayLatency.observe({ model: input.model, phase: 'total' }, input.latencyMs)
  if (input.ttfbMs !== null) {
    gatewayLatency.observe({ model: input.model, phase: 'ttfb' }, input.ttfbMs)
  }
  if (chargeUsd > 0) {
    billingUsdConsumed.inc({ model: input.model }, chargeUsd)
    checkBillingAlerts(input.userId)
  }
}
