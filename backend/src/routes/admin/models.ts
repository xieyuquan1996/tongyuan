// backend/src/routes/admin/models.ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import { AppError } from '../../shared/errors.js'
import * as svc from '../../services/models.js'
import * as upstream from '../../services/upstream-keys.js'

export const adminModelsRoutes = new Hono()
adminModelsRoutes.use('*', requireBearer, requireAdmin)

adminModelsRoutes.get('/', async (c) => c.json({ models: await svc.list({ enabledOnly: false }) }))

adminModelsRoutes.post('/', () => { throw new AppError('method_not_allowed', 'use /sync to import from upstream') })

adminModelsRoutes.post('/sync', async (c) => {
  const active = await upstream.pickActive()
  if (active.length === 0) throw new AppError('all_upstreams_down', 'no active upstream key to perform sync')
  const apiKey = await upstream.decrypt(active[0]!)
  const result = await svc.sync(apiKey)
  return c.json(result)
})

adminModelsRoutes.patch('/:id', zValidator('json', z.object({
  display_name: z.string().optional(),
  markup_pct: z.string().optional(),
  enabled: z.boolean().optional(),
  recommended: z.boolean().optional(),
  note: z.string().optional(),
  input_price_usd_per_mtok: z.string().optional(),
  output_price_usd_per_mtok: z.string().optional(),
  cache_read_price_usd_per_mtok: z.string().optional(),
  cache_write_price_usd_per_mtok: z.string().optional(),
})), async (c) => {
  const b = c.req.valid('json')
  const patch: any = {}
  if (b.display_name !== undefined) patch.displayName = b.display_name
  if (b.markup_pct !== undefined) patch.markupPct = b.markup_pct
  if (b.enabled !== undefined) patch.enabled = b.enabled
  if (b.recommended !== undefined) patch.recommended = b.recommended
  if (b.note !== undefined) patch.note = b.note
  if (b.input_price_usd_per_mtok !== undefined) patch.inputPriceUsdPerMtok = b.input_price_usd_per_mtok
  if (b.output_price_usd_per_mtok !== undefined) patch.outputPriceUsdPerMtok = b.output_price_usd_per_mtok
  if (b.cache_read_price_usd_per_mtok !== undefined) patch.cacheReadPriceUsdPerMtok = b.cache_read_price_usd_per_mtok
  if (b.cache_write_price_usd_per_mtok !== undefined) patch.cacheWritePriceUsdPerMtok = b.cache_write_price_usd_per_mtok
  const row = await svc.patch(c.req.param('id'), patch)
  return c.json(row)
})
