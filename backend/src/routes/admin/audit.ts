// backend/src/routes/admin/audit.ts
// TODO: spec §5.10 audit_events table not yet implemented. When it lands in
// backend/src/db/schema.ts, wire up real queries with filters (action, actor_user_id, limit).
// For now return an empty stub so the admin UI can render without 404.
import { Hono } from 'hono'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'

export const adminAuditRoutes = new Hono()
adminAuditRoutes.use('*', requireBearer, requireAdmin)

adminAuditRoutes.get('/', (c) => c.json({ events: [] }))
