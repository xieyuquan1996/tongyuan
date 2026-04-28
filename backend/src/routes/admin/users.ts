// backend/src/routes/admin/users.ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, gte, ilike, or, sql } from 'drizzle-orm'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import { db, pool } from '../../db/client.js'
import { users, apiKeys, requestLogs, billingLedger } from '../../db/schema.js'
import { toCny } from '../../shared/fx.js'
import { AppError } from '../../shared/errors.js'

export const adminUsersRoutes = new Hono()
adminUsersRoutes.use('*', requireBearer, requireAdmin)

function monthStart() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

adminUsersRoutes.get('/', async (c) => {
  const q = c.req.query('q')
  const status = c.req.query('status')
  const plan = c.req.query('plan')

  const conds = []
  if (q) conds.push(or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`))!)
  if (status) conds.push(eq(users.status, status))
  if (plan) conds.push(eq(users.plan, plan))

  const rows = await db.select().from(users)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(users.createdAt))

  const ms = monthStart()
  const spents = await db.select({
    userId: requestLogs.userId,
    sum: sql<string>`coalesce(sum(cost_usd), 0)::text`,
  }).from(requestLogs)
    .where(gte(requestLogs.createdAt, ms))
    .groupBy(requestLogs.userId)

  const spentMap = new Map(spents.map((s) => [s.userId, Number(s.sum)]))

  return c.json({
    users: rows.map((u) => {
      const balUsd = Number(u.balanceUsd)
      const spentUsd = spentMap.get(u.id) ?? 0
      const limitUsd = u.limitMonthlyUsd ? Number(u.limitMonthlyUsd) : null
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status,
        plan: u.plan,
        balance: toCny(balUsd).toFixed(2),
        balance_usd: balUsd.toFixed(6),
        balance_cny: toCny(balUsd).toFixed(6),
        spent_this_month: toCny(spentUsd).toFixed(2),
        limit_this_month: limitUsd !== null ? toCny(limitUsd).toFixed(2) : '∞',
        limit_monthly_usd: u.limitMonthlyUsd,
        created_at: u.createdAt,
        last_login_at: null,
      }
    }),
  })
})

adminUsersRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const u = await db.query.users.findFirst({ where: eq(users.id, id) })
  if (!u) throw new AppError('not_found')

  const keys = await db.select().from(apiKeys).where(eq(apiKeys.userId, id)).orderBy(desc(apiKeys.createdAt))
  const logs = await db.select().from(requestLogs).where(eq(requestLogs.userId, id))
    .orderBy(desc(requestLogs.createdAt)).limit(20)

  const ms = monthStart()
  const [spent] = await db.select({ sum: sql<string>`coalesce(sum(cost_usd), 0)::text` })
    .from(requestLogs).where(and(eq(requestLogs.userId, id), gte(requestLogs.createdAt, ms)))

  const balUsd = Number(u.balanceUsd)
  const spentUsd = Number(spent!.sum)
  const limitUsd = u.limitMonthlyUsd ? Number(u.limitMonthlyUsd) : null

  return c.json({
    user: {
      id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, plan: u.plan,
      balance: toCny(balUsd).toFixed(2),
      balance_usd: balUsd.toFixed(6),
      balance_cny: toCny(balUsd).toFixed(6),
      spent_this_month: toCny(spentUsd).toFixed(2),
      limit_this_month: limitUsd !== null ? toCny(limitUsd).toFixed(2) : '∞',
      limit_monthly_usd: u.limitMonthlyUsd,
      created_at: u.createdAt,
    },
    keys: keys.map((k) => ({
      id: k.id, name: k.name, prefix: k.prefix, state: k.state,
      created_at: k.createdAt, last_used_at: k.lastUsedAt,
    })),
    recent_logs: logs.map((l) => ({
      id: l.id, status: Number(l.status), model: l.model,
      latency_ms: Number(l.latencyMs), created_at: l.createdAt,
    })),
  })
})

const patchSchema = z.object({
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  plan: z.string().optional(),
  balance_usd_adjust: z.string().optional(),
  limit_this_month: z.string().optional(), // CNY input from UI
  limit_monthly_usd: z.string().optional(),
})

adminUsersRoutes.patch('/:id', zValidator('json', patchSchema), async (c) => {
  const id = c.req.param('id')
  const b = c.req.valid('json')

  const existing = await db.query.users.findFirst({ where: eq(users.id, id) })
  if (!existing) throw new AppError('not_found')

  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (b.role !== undefined) set.role = b.role
  if (b.status !== undefined) set.status = b.status
  if (b.plan !== undefined) set.plan = b.plan
  if (b.limit_monthly_usd !== undefined) set.limitMonthlyUsd = b.limit_monthly_usd
  if (b.limit_this_month !== undefined) {
    // UI sends CNY — convert to USD
    const cny = parseFloat(b.limit_this_month)
    if (!Number.isFinite(cny)) throw new AppError('invalid_amount')
    set.limitMonthlyUsd = (cny / 7.20).toFixed(6)
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (Object.keys(set).length > 1) {
      const parts: string[] = []
      const vals: unknown[] = []
      let i = 1
      for (const [k, v] of Object.entries(set)) {
        const col = k === 'updatedAt' ? 'updated_at'
          : k === 'limitMonthlyUsd' ? 'limit_monthly_usd' : k
        parts.push(`${col} = $${i++}`)
        vals.push(v)
      }
      vals.push(id)
      await client.query(`UPDATE users SET ${parts.join(', ')} WHERE id = $${i}`, vals)
    }
    if (b.balance_usd_adjust !== undefined) {
      const delta = parseFloat(b.balance_usd_adjust)
      if (!Number.isFinite(delta) || delta === 0) throw new AppError('invalid_amount')
      const { rows: after } = await client.query(
        'UPDATE users SET balance_usd = balance_usd + $1, updated_at = NOW() WHERE id = $2 RETURNING balance_usd',
        [delta.toString(), id],
      )
      await client.query(
        `INSERT INTO billing_ledger (user_id, kind, amount_usd, balance_after_usd, note)
         VALUES ($1, 'credit_admin_adjust', $2, $3, $4)`,
        [id, delta.toString(), after[0].balance_usd, 'admin adjust'],
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  return c.json({ ok: true })
})

adminUsersRoutes.post('/:id/adjust', zValidator('json', z.object({
  delta: z.string(),
  note: z.string().optional(),
})), async (c) => {
  const id = c.req.param('id')
  const { delta, note } = c.req.valid('json')
  const deltaCny = parseFloat(delta)
  if (!Number.isFinite(deltaCny) || deltaCny === 0) throw new AppError('invalid_amount')
  const deltaUsd = (deltaCny / 7.20).toFixed(6)

  const existing = await db.query.users.findFirst({ where: eq(users.id, id) })
  if (!existing) throw new AppError('not_found')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: after } = await client.query(
      'UPDATE users SET balance_usd = balance_usd + $1, updated_at = NOW() WHERE id = $2 RETURNING balance_usd',
      [deltaUsd, id],
    )
    await client.query(
      `INSERT INTO billing_ledger (user_id, kind, amount_usd, balance_after_usd, note)
       VALUES ($1, 'credit_admin_adjust', $2, $3, $4)`,
      [id, deltaUsd, after[0].balance_usd, note ?? ''],
    )
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  return c.json({ ok: true })
})
