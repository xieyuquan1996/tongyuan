// backend/src/routes/admin/billing.ts
import { Hono } from 'hono'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import { db } from '../../db/client.js'
import { requestLogs, users, billingLedger } from '../../db/schema.js'
import { toCny, getRate } from '../../shared/fx.js'

export const adminBillingRoutes = new Hono()
adminBillingRoutes.use('*', requireBearer, requireAdmin)

adminBillingRoutes.get('/', async (c) => {
  const now = new Date()
  const since30d = new Date(now.getTime() - 30 * 86_400_000)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [rev30d] = await db.select({
    sum: sql<string>`coalesce(sum(cost_usd), 0)::text`,
    count: sql<number>`count(*)::int`,
    users: sql<number>`count(distinct user_id)::int`,
  }).from(requestLogs).where(gte(requestLogs.createdAt, since30d))

  const [revMtd] = await db.select({
    sum: sql<string>`coalesce(sum(cost_usd), 0)::text`,
  }).from(requestLogs).where(gte(requestLogs.createdAt, monthStart))

  const [outstanding] = await db.select({
    sum: sql<string>`coalesce(sum(balance_usd), 0)::text`,
  }).from(users)

  // plan breakdown for MTD
  const byPlan = await db.select({
    plan: users.plan,
    count: sql<number>`count(distinct ${users.id})::int`,
    revenue: sql<string>`coalesce(sum(${requestLogs.costUsd}), 0)::text`,
  }).from(users)
    .leftJoin(requestLogs, and(
      eq(requestLogs.userId, users.id),
      gte(requestLogs.createdAt, monthStart),
    ))
    .groupBy(users.plan)

  // top users MTD
  const topUsers = await db.select({
    id: users.id,
    email: users.email,
    plan: users.plan,
    status: users.status,
    balanceUsd: users.balanceUsd,
    limitUsd: users.limitMonthlyUsd,
    spentUsd: sql<string>`coalesce(sum(${requestLogs.costUsd}), 0)::text`,
    requestCount: sql<number>`count(${requestLogs.id})::int`,
  }).from(users)
    .leftJoin(requestLogs, and(
      eq(requestLogs.userId, users.id),
      gte(requestLogs.createdAt, monthStart),
    ))
    .groupBy(users.id)
    .orderBy(sql`coalesce(sum(${requestLogs.costUsd}), 0) desc`)
    .limit(10)

  const recentAdjusts = await db.select({
    id: billingLedger.id,
    amountUsd: billingLedger.amountUsd,
    note: billingLedger.note,
    createdAt: billingLedger.createdAt,
    userEmail: users.email,
    userId: billingLedger.userId,
  }).from(billingLedger)
    .innerJoin(users, eq(users.id, billingLedger.userId))
    .where(eq(billingLedger.kind, 'credit_admin_adjust'))
    .orderBy(desc(billingLedger.createdAt))
    .limit(10)

  const rate = await getRate()
  const rev30Usd = Number(rev30d!.sum)
  const revMtdUsd = Number(revMtd!.sum)
  const outstandingUsd = Number(outstanding!.sum)

  return c.json({
    totals: {
      revenue_this_month: toCny(revMtdUsd, rate).toFixed(2),
      revenue_30d: toCny(rev30Usd, rate).toFixed(2),
      revenue_30d_usd: rev30Usd.toFixed(6),
      revenue_30d_cny: toCny(rev30Usd, rate).toFixed(6),
      revenue_mtd_usd: revMtdUsd.toFixed(6),
      revenue_mtd_cny: toCny(revMtdUsd, rate).toFixed(6),
      balance_outstanding: toCny(outstandingUsd, rate).toFixed(2),
      pending_invoices: 0,
      debits_count_30d: Number(rev30d!.count),
      unique_users_30d: Number(rev30d!.users),
      exchange_rate: rate,
    },
    by_plan: byPlan.map((p) => ({
      plan: p.plan,
      count: Number(p.count),
      revenue: toCny(Number(p.revenue), rate).toFixed(2),
    })),
    by_user: topUsers.map((u) => {
      const bal = Number(u.balanceUsd)
      const spent = Number(u.spentUsd)
      const limit = u.limitUsd ? Number(u.limitUsd) : null
      return {
        id: u.id,
        email: u.email,
        plan: u.plan,
        status: u.status,
        balance: toCny(bal, rate).toFixed(2),
        spent_this_month: toCny(spent, rate).toFixed(2),
        limit_this_month: limit !== null ? toCny(limit, rate).toFixed(2) : '∞',
      }
    }),
    top_users: topUsers.map((u) => ({
      user_id: u.id,
      email: u.email,
      spent_usd: Number(u.spentUsd).toFixed(6),
      spent_cny: toCny(Number(u.spentUsd), rate).toFixed(6),
      request_count: Number(u.requestCount),
    })),
    recent_adjustments: recentAdjusts.map((a) => ({
      id: a.id,
      user_email: a.userEmail,
      amount_usd: Number(a.amountUsd).toFixed(6),
      note: a.note,
      created_at: a.createdAt,
    })),
    invoices: [],
    recharges: [],
  })
})
