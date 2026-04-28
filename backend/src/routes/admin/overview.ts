// backend/src/routes/admin/overview.ts
import { Hono } from 'hono'
import { desc, gte, sql } from 'drizzle-orm'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import { db } from '../../db/client.js'
import { requestLogs, users } from '../../db/schema.js'

export const adminOverviewRoutes = new Hono()
adminOverviewRoutes.use('*', requireBearer, requireAdmin)

adminOverviewRoutes.get('/', async (c) => {
  const now = new Date()
  const since24h = new Date(now.getTime() - 86_400_000)
  const since7d = new Date(now.getTime() - 7 * 86_400_000)
  const since30d = new Date(now.getTime() - 30 * 86_400_000)

  const [userStats] = await db.select({
    total: sql<number>`count(*)::int`,
    active: sql<number>`count(*) filter (where status = 'active')::int`,
    new7d: sql<number>`count(*) filter (where created_at >= ${since7d})::int`,
    balance: sql<string>`coalesce(sum(balance_usd), 0)::text`,
  }).from(users)

  const [req24h] = await db.select({
    count: sql<number>`count(*)::int`,
    errors: sql<number>`count(*) filter (where status >= '400')::int`,
  }).from(requestLogs).where(gte(requestLogs.createdAt, since24h))

  const [rev30d] = await db.select({
    spent: sql<string>`coalesce(sum(cost_usd), 0)::text`,
  }).from(requestLogs).where(gte(requestLogs.createdAt, since30d))

  const daily = await db.select({
    date: sql<string>`to_char(created_at::date, 'YYYY-MM-DD')`,
    requests: sql<number>`count(*)::int`,
    errors: sql<number>`count(*) filter (where status >= '400')::int`,
  }).from(requestLogs)
    .where(gte(requestLogs.createdAt, since30d))
    .groupBy(sql`created_at::date`)
    .orderBy(sql`created_at::date`)

  const total24 = Number(req24h!.count)
  const errRate = total24 === 0 ? '0.00%' : ((Number(req24h!.errors) / total24) * 100).toFixed(2) + '%'

  return c.json({
    metrics: {
      users_total: Number(userStats!.total),
      users_active: Number(userStats!.active),
      users_new_7d: Number(userStats!.new7d),
      requests_24h: total24,
      errors_24h: Number(req24h!.errors),
      error_rate: errRate,
      spent_30d: Number(rev30d!.spent).toFixed(2),
      balance_total: Number(userStats!.balance).toFixed(2),
    },
    daily: daily.map((d) => ({ date: d.date, requests: Number(d.requests), errors: Number(d.errors) })),
    recent_audit: [], // audit_events table not implemented yet
  })
})
