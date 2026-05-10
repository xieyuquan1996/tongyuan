import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireBearer } from '../../middleware/auth-bearer.js'
import * as svc from '../../services/alerts.js'

export const alertsRoutes = new Hono()
alertsRoutes.use('*', requireBearer)

const KIND = z.enum(['balance_low', 'spend_daily', 'error_rate', 'p99_latency'])
const CHANNEL = z.enum(['browser', 'email', 'webhook'])
const THRESHOLD = z.union([z.string(), z.number()]).transform((v) => String(v))
const WEBHOOK_URL = z.union([z.string().url(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v && v !== '') ? v : null)

alertsRoutes.get('/', async (c) => c.json({ alerts: await svc.list(c.get('user').id) }))

alertsRoutes.post('/', zValidator('json', z.object({
  kind: KIND,
  threshold: THRESHOLD,
  channel: CHANNEL,
  enabled: z.boolean().default(true),
  webhookUrl: WEBHOOK_URL,
})), async (c) => {
  const b = c.req.valid('json')
  return c.json(await svc.create(c.get('user').id, b), 201)
})

alertsRoutes.patch('/:id', zValidator('json', z.object({
  threshold: THRESHOLD.optional(),
  channel: CHANNEL.optional(),
  enabled: z.boolean().optional(),
  webhookUrl: WEBHOOK_URL,
})), async (c) => c.json(await svc.patch(c.get('user').id, c.req.param('id'), c.req.valid('json'))))

alertsRoutes.delete('/:id', async (c) => {
  await svc.remove(c.get('user').id, c.req.param('id'))
  return c.json({ ok: true })
})
