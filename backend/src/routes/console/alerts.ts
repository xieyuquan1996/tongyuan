import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireBearer } from '../../middleware/auth-bearer.js'
import * as svc from '../../services/alerts.js'

export const alertsRoutes = new Hono()
alertsRoutes.use('*', requireBearer)

alertsRoutes.get('/', async (c) => c.json({ alerts: await svc.list(c.get('user').id) }))

alertsRoutes.post('/', zValidator('json', z.object({
  kind: z.enum(['balance_low', 'spend_daily', 'error_rate']),
  threshold: z.string(),
  channel: z.enum(['email', 'browser']),
  enabled: z.boolean().default(true),
})), async (c) => {
  const b = c.req.valid('json')
  return c.json(await svc.create(c.get('user').id, b), 201)
})

alertsRoutes.patch('/:id', zValidator('json', z.object({
  threshold: z.string().optional(),
  channel: z.enum(['email', 'browser']).optional(),
  enabled: z.boolean().optional(),
})), async (c) => c.json(await svc.patch(c.get('user').id, c.req.param('id'), c.req.valid('json'))))

alertsRoutes.delete('/:id', async (c) => {
  await svc.remove(c.get('user').id, c.req.param('id'))
  return c.json({ ok: true })
})
