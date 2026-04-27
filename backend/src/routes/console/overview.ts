import { Hono } from 'hono'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { db } from '../../db/client.js'
import { requestLogs } from '../../db/schema.js'

export const overviewRoutes = new Hono()
overviewRoutes.use('*', requireBearer)

overviewRoutes.get('/', async (c) => {
  const userId = c.get('user').id
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000)

  const [stats] = await db
    .select({
      count: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where status >= '400')::int`,
      p99: sql<number>`coalesce(percentile_cont(0.99) within group (order by latency_ms), 0)::int`,
      spent: sql<string>`coalesce(sum(cost_usd), 0)::text`,
    })
    .from(requestLogs)
    .where(and(eq(requestLogs.userId, userId), gte(requestLogs.createdAt, thirtyDaysAgo)))

  const recent = await db.select().from(requestLogs)
    .where(eq(requestLogs.userId, userId))
    .orderBy(desc(requestLogs.createdAt))
    .limit(5)

  const latencyRows = await db.select({ latency: requestLogs.latencyMs }).from(requestLogs)
    .where(eq(requestLogs.userId, userId))
    .orderBy(desc(requestLogs.createdAt))
    .limit(60)

  const total = Number(stats!.count)
  const uptime = total === 0 ? '100.00%' : ((1 - Number(stats!.errors) / total) * 100).toFixed(2) + '%'

  return c.json({
    metrics: {
      uptime_30d: uptime,
      p99_live_ms: stats!.p99,
      requests_30d: String(total),
      spent: `$${Number(stats!.spent).toFixed(2)}`,
      projection: `$${(Number(stats!.spent) * 2).toFixed(2)}`,
    },
    latency_series: latencyRows.reverse().map((r) => Number(r.latency)),
    recent_requests: recent.map((r) => ({
      id: r.id,
      status: Number(r.status),
      model: r.model,
      latency_ms: Number(r.latencyMs),
      tokens: Number(r.inputTokens) + Number(r.outputTokens),
      cost: Number(r.costUsd).toFixed(4),
      region: 'cn-east-1',
      created_at: r.createdAt,
      audit_match: r.auditMatch,
    })),
  })
})
