// backend/src/gateway/biller.ts
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users, requestLogs, billingLedger } from '../db/schema.js'

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
  chargeUsd: string
  costUsd: string
  requestHash: string
  upstreamRequestHash: string
  auditMatch: boolean
  idempotencyKey: string | null
}

export async function commitRequest(input: CommitInput): Promise<void> {
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
      costUsd: input.costUsd,
      requestHash: input.requestHash,
      upstreamRequestHash: input.upstreamRequestHash,
      auditMatch: input.auditMatch,
      idempotencyKey: input.idempotencyKey,
    })

    if (Number(input.chargeUsd) > 0) {
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
}
