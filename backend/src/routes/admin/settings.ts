// backend/src/routes/admin/settings.ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import { db } from '../../db/client.js'
import { settings } from '../../db/schema.js'
import { invalidateRateCache } from '../../shared/fx.js'
import { AppError } from '../../shared/errors.js'
import * as audit from '../../services/audit.js'

export const adminSettingsRoutes = new Hono()
adminSettingsRoutes.use('*', requireBearer, requireAdmin)

adminSettingsRoutes.get('/', async (c) => {
  const rows = await db.select().from(settings)
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return c.json({
    usd_to_cny: Number(map['usd_to_cny'] ?? 7.20),
    signup_credit_usd: Number(map['signup_credit_usd'] ?? 10),
  })
})

const putBody = z.object({
  usd_to_cny: z.number().min(1).max(100).optional(),
  signup_credit_usd: z.number().min(0).max(10_000).optional(),
})

adminSettingsRoutes.put('/', zValidator('json', putBody), async (c) => {
  const body = c.req.valid('json')
  if (body.usd_to_cny === undefined && body.signup_credit_usd === undefined) {
    throw new AppError('missing_fields', '至少需要一个可更新的字段')
  }

  if (body.usd_to_cny !== undefined) {
    await db.insert(settings)
      .values({ key: 'usd_to_cny', value: String(body.usd_to_cny) })
      .onConflictDoUpdate({ target: settings.key, set: { value: String(body.usd_to_cny), updatedAt: new Date() } })
    invalidateRateCache()
  }
  if (body.signup_credit_usd !== undefined) {
    await db.insert(settings)
      .values({ key: 'signup_credit_usd', value: String(body.signup_credit_usd) })
      .onConflictDoUpdate({ target: settings.key, set: { value: String(body.signup_credit_usd), updatedAt: new Date() } })
  }

  const rows = await db.select().from(settings)
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))

  await audit.record({
    actor: c.get('user'),
    action: 'admin.settings.update',
    target: Object.keys(body).join(','),
    metadata: { patch: body },
  })

  return c.json({
    ok: true,
    usd_to_cny: Number(map['usd_to_cny'] ?? 7.20),
    signup_credit_usd: Number(map['signup_credit_usd'] ?? 10),
  })
})
