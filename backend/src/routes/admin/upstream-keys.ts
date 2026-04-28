// backend/src/routes/admin/upstream-keys.ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import * as svc from '../../services/upstream-keys.js'

export const upstreamKeysRoutes = new Hono()
upstreamKeysRoutes.use('*', requireBearer, requireAdmin)

upstreamKeysRoutes.get('/', async (c) => {
  const rows = await svc.list()
  return c.json({ upstream_keys: rows.map(svc.toPublic) })
})

upstreamKeysRoutes.post('/', zValidator('json', z.object({
  alias: z.string().min(1),
  secret: z.string().min(10),
  priority: z.number().int().optional(),
  quota_hint_usd: z.string().optional(),
  base_url: z.string().url().optional(),
})), async (c) => {
  const b = c.req.valid('json')
  const row = await svc.create({ alias: b.alias, secret: b.secret, priority: b.priority, quotaHintUsd: b.quota_hint_usd, baseUrl: b.base_url })
  return c.json(svc.toPublic(row), 201)
})

upstreamKeysRoutes.patch('/:id', zValidator('json', z.object({
  alias: z.string().optional(),
  state: z.enum(['active', 'cooldown', 'disabled']).optional(),
  priority: z.number().int().optional(),
})), async (c) => {
  const row = await svc.patch(c.req.param('id'), c.req.valid('json'))
  return c.json(svc.toPublic(row))
})

upstreamKeysRoutes.delete('/:id', async (c) => {
  await svc.remove(c.req.param('id'))
  return c.json({ ok: true })
})
