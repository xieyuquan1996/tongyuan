import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import { runReconciliation } from '../../services/reconciliation.js'
import { db } from '../../db/client.js'
import { reconciliationReports, upstreamKeys } from '../../db/schema.js'
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { AppError } from '../../shared/errors.js'

export const reconciliationRoutes = new Hono()
reconciliationRoutes.use('*', requireBearer, requireAdmin)

const runBody = z.object({
  upstreamKeyIds: z.array(z.string().uuid()).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  bucketWidth: z.enum(['1d', '1h']),
})

reconciliationRoutes.post('/run', zValidator('json', runBody), async (c) => {
  const { upstreamKeyIds, startAt, endAt, bucketWidth } = c.req.valid('json')

  const start = new Date(startAt)
  const end = new Date(endAt)
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)

  if (bucketWidth === '1h' && diffDays > 7) {
    throw new AppError('missing_fields', '1h granularity supports at most 7 days')
  }
  if (bucketWidth === '1d' && diffDays > 31) {
    throw new AppError('missing_fields', '1d granularity supports at most 31 days')
  }

  let keyIds: string[]
  if (upstreamKeyIds && upstreamKeyIds.length > 0) {
    keyIds = upstreamKeyIds
  } else {
    const keys = await db.select({ id: upstreamKeys.id })
      .from(upstreamKeys)
      .where(sql`${upstreamKeys.adminKeyCiphertext} IS NOT NULL AND ${upstreamKeys.anthropicKeyId} IS NOT NULL`)
    keyIds = keys.map((k) => k.id)
  }

  const allResults = []
  for (const keyId of keyIds) {
    const results = await runReconciliation(keyId, start, end, bucketWidth)
    allResults.push(...results)
  }

  return c.json({ results: allResults })
})

const reportsQuery = z.object({
  upstreamKeyId: z.string().uuid().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  bucketWidth: z.enum(['1d', '1h']).optional(),
  status: z.enum(['match', 'warn', 'mismatch']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
})

reconciliationRoutes.get('/reports', zValidator('query', reportsQuery), async (c) => {
  const { upstreamKeyId, startAt, endAt, bucketWidth, status, page, pageSize } = c.req.valid('query')

  const conditions = []
  if (upstreamKeyId) conditions.push(eq(reconciliationReports.upstreamKeyId, upstreamKeyId))
  if (startAt) conditions.push(gte(reconciliationReports.bucketAt, new Date(startAt)))
  if (endAt) conditions.push(lte(reconciliationReports.bucketAt, new Date(endAt)))
  if (bucketWidth) conditions.push(eq(reconciliationReports.bucketWidth, bucketWidth))
  if (status) conditions.push(eq(reconciliationReports.status, status))

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const countRows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(reconciliationReports)
    .where(where)
  const total = countRows[0]?.total ?? 0

  const reports = await db
    .select({
      id: reconciliationReports.id,
      upstreamKeyId: reconciliationReports.upstreamKeyId,
      upstreamKeyAlias: upstreamKeys.alias,
      bucketWidth: reconciliationReports.bucketWidth,
      bucketAt: reconciliationReports.bucketAt,
      localInputTokens: reconciliationReports.localInputTokens,
      anthropicInputTokens: reconciliationReports.anthropicInputTokens,
      localOutputTokens: reconciliationReports.localOutputTokens,
      anthropicOutputTokens: reconciliationReports.anthropicOutputTokens,
      localCacheReadTokens: reconciliationReports.localCacheReadTokens,
      anthropicCacheReadTokens: reconciliationReports.anthropicCacheReadTokens,
      localCacheWriteTokens: reconciliationReports.localCacheWriteTokens,
      anthropicCacheWriteTokens: reconciliationReports.anthropicCacheWriteTokens,
      localCostUsd: reconciliationReports.localCostUsd,
      anthropicCostUsd: reconciliationReports.anthropicCostUsd,
      inputDiffPct: reconciliationReports.inputDiffPct,
      outputDiffPct: reconciliationReports.outputDiffPct,
      status: reconciliationReports.status,
      ranAt: reconciliationReports.ranAt,
    })
    .from(reconciliationReports)
    .leftJoin(upstreamKeys, eq(reconciliationReports.upstreamKeyId, upstreamKeys.id))
    .where(where)
    .orderBy(desc(reconciliationReports.bucketAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return c.json({ reports, total, page, pageSize })
})
