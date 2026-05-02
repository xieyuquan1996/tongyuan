// backend/src/routes/admin/audit.ts
//
// Read endpoint for the admin Audit page. Mutating admin routes call
// services/audit.record() to populate the table; this just lists what's
// there with a couple of obvious filters.

import { Hono } from 'hono'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import * as audit from '../../services/audit.js'

export const adminAuditRoutes = new Hono()
adminAuditRoutes.use('*', requireBearer, requireAdmin)

adminAuditRoutes.get('/', async (c) => {
  const action = c.req.query('action') || undefined
  const q = c.req.query('q') || undefined
  const limitRaw = Number(c.req.query('limit') ?? 100)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 100
  const events = await audit.list({ action, q, limit })
  return c.json({ events: events.map(audit.toPublic) })
})
