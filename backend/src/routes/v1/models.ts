// backend/src/routes/v1/models.ts
import { Hono } from 'hono'
import * as svc from '../../services/models.js'
import { requireApiKey } from '../../middleware/auth-api-key.js'

export const v1Models = new Hono()
v1Models.use('*', requireApiKey)

v1Models.get('/', async (c) => {
  const rows = await svc.list({ enabledOnly: true })
  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      display_name: r.displayName,
      type: 'model',
      created_at: r.syncedAt.toISOString(),
    })),
    has_more: false,
    first_id: rows[0]?.id ?? null,
    last_id: rows[rows.length - 1]?.id ?? null,
  })
})
