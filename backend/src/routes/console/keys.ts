// backend/src/routes/console/keys.ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { createKey, listKeys, revokeKey, toPublicKey } from '../../services/api-keys.js'

export const keysRoutes = new Hono()
keysRoutes.use('*', requireBearer)

keysRoutes.get('/', async (c) => {
  const rows = await listKeys(c.get('user').id)
  return c.json({ keys: rows.map(toPublicKey) })
})

keysRoutes.post('/', zValidator('json', z.object({ name: z.string().min(1) })), async (c) => {
  const { name } = c.req.valid('json')
  const { row, secret } = await createKey(c.get('user').id, name)
  return c.json({ ...toPublicKey(row), secret }, 201)
})

keysRoutes.post('/:id/revoke', async (c) => {
  const row = await revokeKey(c.get('user').id, c.req.param('id'))
  return c.json(toPublicKey(row))
})
