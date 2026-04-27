import { Hono } from 'hono'
import { and, gte, sql, eq } from 'drizzle-orm'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { db } from '../../db/client.js'
import { billingLedger } from '../../db/schema.js'
import { AppError } from '../../shared/errors.js'
import { toCny, fmtCny } from '../../shared/fx.js'

export const billingRoutes = new Hono()
billingRoutes.use('*', requireBearer)

billingRoutes.get('/', async (c) => {
  const u = c.get('user')
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const [used] = await db.select({ sum: sql<string>`coalesce(sum(-amount_usd), 0)::text` })
    .from(billingLedger)
    .where(and(eq(billingLedger.userId, u.id), eq(billingLedger.kind, 'debit_usage'), gte(billingLedger.createdAt, monthStart)))

  const usedUsd = Number(used!.sum)
  const balance = Number(u.balanceUsd)
  const limit = u.limitMonthlyUsd ? Number(u.limitMonthlyUsd) : null
  const projectionUsd = usedUsd * 2
  const now = new Date()
  const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const usedCny = toCny(usedUsd)
  const balanceCny = toCny(balance)

  return c.json({
    billing: {
      month_label: `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`,
      used: fmtCny(usedCny),
      limit: limit !== null ? fmtCny(toCny(limit)) : '∞',
      projection: fmtCny(toCny(projectionUsd)),
      balance: fmtCny(balanceCny),
      next_reset: nextReset.toISOString().slice(0, 10),
      used_usd: usedUsd.toFixed(6),
      used_cny: usedCny.toFixed(6),
      balance_usd: balance.toFixed(6),
      balance_cny: balanceCny.toFixed(6),
    },
    plan: u.plan,
  })
})

export const invoicesRoutes = new Hono()
invoicesRoutes.use('*', requireBearer)
invoicesRoutes.get('/', (c) => c.json({ invoices: [] }))

export const rechargesRoutes = new Hono()
rechargesRoutes.use('*', requireBearer)
rechargesRoutes.get('/', (c) => c.json({ recharges: [] }))

export const rechargeRoutes = new Hono()
rechargeRoutes.use('*', requireBearer)
rechargeRoutes.post('/', () => { throw new AppError('not_implemented', '充值功能即将上线') })
