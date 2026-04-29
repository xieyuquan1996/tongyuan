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

export const adminSettingsRoutes = new Hono()
adminSettingsRoutes.use('*', requireBearer, requireAdmin)

adminSettingsRoutes.get('/', async (c) => {
  const rows = await db.select().from(settings)
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return c.json({
    usd_to_cny: Number(map['usd_to_cny'] ?? 7.20),
  })
})

const putBody = z.object({
  usd_to_cny: z.number().min(1).max(100),
})

adminSettingsRoutes.put('/', zValidator('json', putBody), async (c) => {
  const { usd_to_cny } = c.req.valid('json')
  await db.insert(settings)
    .values({ key: 'usd_to_cny', value: String(usd_to_cny) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(usd_to_cny), updatedAt: new Date() } })
  invalidateRateCache()
  return c.json({ ok: true, usd_to_cny })
})
