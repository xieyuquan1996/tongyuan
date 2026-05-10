// src/services/reconciliation.ts
import { and, eq, gte, lt, sql, sum } from 'drizzle-orm'
import { db } from '../db/client.js'
import { reconciliationReports, requestLogs, upstreamKeys } from '../db/schema.js'
import { decryptSecret } from '../crypto/kms.js'
import { env } from '../env.js'
import { AppError } from '../shared/errors.js'

export type BucketWidth = '1d' | '1h'

export interface BucketData {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export function diffPct(local: number, anthropic: number): number | null {
  if (anthropic === 0 && local === 0) return 0
  if (anthropic === 0) return null
  return ((local - anthropic) / anthropic) * 100
}

export function calcStatus(
  inputDiff: number | null,
  outputDiff: number | null,
  _costDiff: number | null
): 'match' | 'warn' | 'mismatch' {
  const diffs = [inputDiff, outputDiff]
    .filter((d): d is number => d !== null)
    .map(Math.abs)
  if (diffs.length === 0) return 'match'
  const max = Math.max(...diffs)
  if (max < 0.1) return 'match'
  if (max < 1) return 'warn'
  return 'mismatch'
}

interface AnthropicUsageResult {
  uncached_input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation: {
    ephemeral_5m_input_tokens: number
    ephemeral_1h_input_tokens: number
  }
}

interface AnthropicUsageBucket {
  starting_at: string
  ending_at: string
  results: AnthropicUsageResult[]
}

interface AnthropicUsageResponse {
  data: AnthropicUsageBucket[]
  has_more: boolean
  next_page: string | null
}

export async function fetchAnthropicUsage(
  adminKey: string,
  _anthropicKeyId: string,
  startAt: Date,
  endAt: Date,
  bucketWidth: BucketWidth
): Promise<Map<string, BucketData>> {
  const result = new Map<string, BucketData>()
  let nextPage: string | null = null

  do {
    const params = new URLSearchParams({
      starting_at: startAt.toISOString(),
      ending_at: endAt.toISOString(),
      bucket_width: bucketWidth,
    })
    if (nextPage) params.set('page', nextPage)

    const resp = await fetch(
      `https://api.anthropic.com/v1/organizations/usage_report/messages?${params}`,
      { headers: { 'anthropic-version': '2023-06-01', 'x-api-key': adminKey } }
    )
    if (!resp.ok) {
      const body = await resp.text()
      throw new AppError('upstream_error', `Anthropic Admin API ${resp.status}: ${body}`)
    }
    const data = await resp.json() as AnthropicUsageResponse

    for (const bucket of data.data) {
      if (!bucket.starting_at) continue
      const key = new Date(bucket.starting_at).toISOString()
      let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0
      for (const row of (bucket.results ?? [])) {
        const cacheRead = row.cache_read_input_tokens ?? 0
        const cacheWrite = (row.cache_creation?.ephemeral_5m_input_tokens ?? 0) + (row.cache_creation?.ephemeral_1h_input_tokens ?? 0)
        // inputTokens = total input (matches Claude Console "Total tokens in")
        inputTokens += (row.uncached_input_tokens ?? 0) + cacheRead + cacheWrite
        outputTokens += row.output_tokens ?? 0
        cacheReadTokens += cacheRead
        cacheWriteTokens += cacheWrite
      }
      const existing = result.get(key)
      if (existing) {
        existing.inputTokens += inputTokens
        existing.outputTokens += outputTokens
        existing.cacheReadTokens += cacheReadTokens
        existing.cacheWriteTokens += cacheWriteTokens
      } else {
        result.set(key, { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens })
      }
    }
    nextPage = data.next_page
  } while (nextPage)

  return result
}

interface AnthropicCostBucket {
  starting_at: string
  ending_at: string
  results: { amount: string; currency: string }[]
}

interface AnthropicCostResponse {
  data: AnthropicCostBucket[]
  has_more: boolean
  next_page: string | null
}

// Fetches org-level daily cost from /v1/organizations/cost_report.
// Returns a Map<bucketIsoDate, costUsd>. Only supports 1d granularity.
// amount is in cents (lowest unit), divide by 100 to get USD.
export async function fetchAnthropicCost(
  adminKey: string,
  startAt: Date,
  endAt: Date
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  let nextPage: string | null = null

  do {
    const params = new URLSearchParams({
      starting_at: startAt.toISOString(),
      ending_at: endAt.toISOString(),
      bucket_width: '1d',
    })
    if (nextPage) params.set('page', nextPage)

    const resp = await fetch(
      `https://api.anthropic.com/v1/organizations/cost_report?${params}`,
      { headers: { 'anthropic-version': '2023-06-01', 'x-api-key': adminKey } }
    )
    if (!resp.ok) {
      const body = await resp.text()
      throw new AppError('upstream_error', `Anthropic Cost API ${resp.status}: ${body}`)
    }
    const data = await resp.json() as AnthropicCostResponse

    for (const bucket of data.data) {
      if (!bucket.starting_at) continue
      const key = new Date(bucket.starting_at).toISOString()
      let totalCents = 0
      for (const row of (bucket.results ?? [])) {
        totalCents += Number(row.amount ?? 0)
      }
      const existing = result.get(key) ?? 0
      result.set(key, existing + totalCents / 100)
    }
    nextPage = data.next_page
  } while (nextPage)

  return result
}

export async function computeLocalUsage(
  upstreamKeyId: string,
  startAt: Date,
  endAt: Date,
  bucketWidth: BucketWidth
): Promise<Map<string, BucketData & { costUsd: number }>> {
  // date_trunc on a timestamptz column returns timestamptz (UTC-aligned)
  const truncUnit = bucketWidth === '1h' ? 'hour' : 'day'
  const bucketExpr = sql<string>`date_trunc(${sql.raw(`'${truncUnit}'`)}, ${requestLogs.createdAt})`

  const rows = await db
    .select({
      bucket: bucketExpr,
      inputTokens: sum(requestLogs.inputTokens),
      outputTokens: sum(requestLogs.outputTokens),
      cacheReadTokens: sum(requestLogs.cacheReadTokens),
      cacheWriteTokens: sum(sql`${requestLogs.cacheWriteTokens} + ${requestLogs.cacheWrite1hTokens}`),
      costUsd: sum(requestLogs.costUsd),
    })
    .from(requestLogs)
    .where(and(
      eq(requestLogs.upstreamKeyId, upstreamKeyId),
      gte(requestLogs.createdAt, startAt),
      lt(requestLogs.createdAt, endAt),
    ))
    .groupBy(bucketExpr)

  const result = new Map<string, BucketData & { costUsd: number }>()
  for (const row of rows) {
    result.set(new Date(row.bucket).toISOString(), {
      // inputTokens = total input (uncached + cache read + cache write), matches Claude Console
      inputTokens: Number(row.inputTokens ?? '0') + Number(row.cacheReadTokens ?? '0') + Number(row.cacheWriteTokens ?? '0'),
      outputTokens: Number(row.outputTokens ?? '0'),
      cacheReadTokens: Number(row.cacheReadTokens ?? '0'),
      cacheWriteTokens: Number(row.cacheWriteTokens ?? '0'),
      costUsd: Number(row.costUsd ?? '0'),
    })
  }
  return result
}

// Allow injecting fetchAnthropicUsage / fetchAnthropicCost for testing (vitest ESM spy limitation workaround)
export async function runReconciliation(
  upstreamKeyId: string,
  startAt: Date,
  endAt: Date,
  bucketWidth: BucketWidth,
  _fetchUsage?: typeof fetchAnthropicUsage,
  _fetchCost?: typeof fetchAnthropicCost
) {
  const fetchUsage = _fetchUsage ?? fetchAnthropicUsage
  const fetchCost = _fetchCost ?? fetchAnthropicCost

  const [key] = await db.select().from(upstreamKeys).where(eq(upstreamKeys.id, upstreamKeyId))
  if (!key) throw new AppError('not_found')
  if (!key.adminKeyCiphertext || !key.anthropicKeyId) {
    throw new AppError('missing_fields', 'upstream key missing adminKeyCiphertext or anthropicKeyId')
  }

  const adminKey = decryptSecret(key.adminKeyCiphertext, env.UPSTREAM_KEY_KMS)

  // Cost API only supports 1d granularity; skip for hourly runs
  const [anthropicUsage, localUsage, anthropicCost] = await Promise.all([
    fetchUsage(adminKey, key.anthropicKeyId, startAt, endAt, bucketWidth),
    computeLocalUsage(upstreamKeyId, startAt, endAt, bucketWidth),
    bucketWidth === '1d' ? fetchCost(adminKey, startAt, endAt) : Promise.resolve(new Map<string, number>()),
  ])

  const allBuckets = new Set([...anthropicUsage.keys(), ...localUsage.keys()])
  const reports: (typeof reconciliationReports.$inferInsert)[] = []

  for (const bucket of allBuckets) {
    const a = anthropicUsage.get(bucket) ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
    const l = localUsage.get(bucket) ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 }

    const inputDiff = diffPct(l.inputTokens, a.inputTokens)
    const outputDiff = diffPct(l.outputTokens, a.outputTokens)
    const status = calcStatus(inputDiff, outputDiff, null)

    const aCost = anthropicCost.get(bucket) ?? null
    reports.push({
      upstreamKeyId,
      bucketWidth,
      bucketAt: new Date(bucket),
      localInputTokens: String(l.inputTokens),
      anthropicInputTokens: String(a.inputTokens),
      localOutputTokens: String(l.outputTokens),
      anthropicOutputTokens: String(a.outputTokens),
      localCacheReadTokens: String(l.cacheReadTokens),
      anthropicCacheReadTokens: String(a.cacheReadTokens),
      localCacheWriteTokens: String(l.cacheWriteTokens),
      anthropicCacheWriteTokens: String(a.cacheWriteTokens),
      localCostUsd: String((l as { costUsd: number }).costUsd),
      anthropicCostUsd: aCost !== null ? String(aCost) : null,
      inputDiffPct: inputDiff !== null ? String(inputDiff) : null,
      outputDiffPct: outputDiff !== null ? String(outputDiff) : null,
      status,
    })
  }

  if (reports.length > 0) {
    await db.insert(reconciliationReports)
      .values(reports)
      .onConflictDoUpdate({
        target: [reconciliationReports.upstreamKeyId, reconciliationReports.bucketWidth, reconciliationReports.bucketAt],
        set: {
          localInputTokens: sql`excluded.local_input_tokens`,
          anthropicInputTokens: sql`excluded.anthropic_input_tokens`,
          localOutputTokens: sql`excluded.local_output_tokens`,
          anthropicOutputTokens: sql`excluded.anthropic_output_tokens`,
          localCacheReadTokens: sql`excluded.local_cache_read_tokens`,
          anthropicCacheReadTokens: sql`excluded.anthropic_cache_read_tokens`,
          localCacheWriteTokens: sql`excluded.local_cache_write_tokens`,
          anthropicCacheWriteTokens: sql`excluded.anthropic_cache_write_tokens`,
          localCostUsd: sql`excluded.local_cost_usd`,
          anthropicCostUsd: sql`excluded.anthropic_cost_usd`,
          inputDiffPct: sql`excluded.input_diff_pct`,
          outputDiffPct: sql`excluded.output_diff_pct`,
          status: sql`excluded.status`,
          ranAt: sql`now()`,
        },
      })
  }

  return reports
}
