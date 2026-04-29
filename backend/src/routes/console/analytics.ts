// backend/src/routes/console/analytics.ts
import { Hono } from 'hono'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { db } from '../../db/client.js'
import { requestLogs } from '../../db/schema.js'
import { toCny, getRate } from '../../shared/fx.js'

export const analyticsRoutes = new Hono()
analyticsRoutes.use('*', requireBearer)

function rangeMs(range: string): number {
  if (range === '7d') return 7 * 86_400_000
  if (range === '90d') return 90 * 86_400_000
  return 30 * 86_400_000
}

analyticsRoutes.get('/', async (c) => {
  const range = c.req.query('range') ?? '30d'
  const userId = c.get('user').id
  const since = new Date(Date.now() - rangeMs(range))

  const scope = and(eq(requestLogs.userId, userId), gte(requestLogs.createdAt, since))
  const rate = await getRate()

  // Daily buckets
  const daily = await db.select({
    date: sql<string>`to_char(created_at::date, 'YYYY-MM-DD')`,
    requests: sql<number>`count(*)::int`,
    tokens: sql<number>`coalesce(sum(input_tokens::int + output_tokens::int), 0)::int`,
    cost_usd: sql<string>`coalesce(sum(cost_usd), 0)::text`,
  }).from(requestLogs)
    .where(scope)
    .groupBy(sql`created_at::date`)
    .orderBy(sql`created_at::date`)

  // By model
  const byModelRaw = await db.select({
    model: requestLogs.model,
    requests: sql<number>`count(*)::int`,
    tokens: sql<number>`coalesce(sum(input_tokens::int + output_tokens::int), 0)::int`,
    cost_usd: sql<string>`coalesce(sum(cost_usd), 0)::text`,
  }).from(requestLogs)
    .where(scope)
    .groupBy(requestLogs.model)
    .orderBy(desc(sql`count(*)`))

  const totalReqs = byModelRaw.reduce((a, r) => a + Number(r.requests), 0) || 1
  const by_model = byModelRaw.map((r) => ({
    model: r.model,
    requests: Number(r.requests),
    tokens_m: Math.round(Number(r.tokens) / 1_000_000 * 100) / 100,
    cost: '¥' + toCny(Number(r.cost_usd), rate).toFixed(2),
    share: Math.round((Number(r.requests) / totalReqs) * 100),
  }))

  // By region (single region for now)
  const [regionStats] = await db.select({
    requests: sql<number>`count(*)::int`,
    p99: sql<number>`coalesce(percentile_cont(0.99) within group (order by latency_ms), 0)::int`,
  }).from(requestLogs).where(scope)

  const by_region = [{
    region: 'cn-east-1',
    requests: Number(regionStats!.requests),
    p99: Number(regionStats!.p99),
    share: 100,
  }]

  // Error distribution
  const errorsRaw = await db.select({
    kind: requestLogs.errorCode,
    count: sql<number>`count(*)::int`,
  }).from(requestLogs)
    .where(and(scope, sql`error_code is not null`))
    .groupBy(requestLogs.errorCode)
    .orderBy(desc(sql`count(*)`))

  const totalErr = errorsRaw.reduce((a, r) => a + Number(r.count), 0) || 1
  const errors = errorsRaw.map((r) => ({
    kind: r.kind ?? 'unknown',
    count: Number(r.count),
    pct: Math.round((Number(r.count) / totalErr) * 100) + '%',
  }))

  return c.json({
    daily: daily.map((d) => ({
      date: d.date,
      requests: Number(d.requests),
      tokens: Number(d.tokens),
      cost: '¥' + toCny(Number(d.cost_usd), rate).toFixed(2),
    })),
    by_model, by_region, errors,
  })
})
