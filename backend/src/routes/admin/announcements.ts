// backend/src/routes/admin/announcements.ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { eq, desc } from 'drizzle-orm'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import { db } from '../../db/client.js'
import { announcements } from '../../db/schema.js'
import { AppError } from '../../shared/errors.js'

export const adminAnnouncementsRoutes = new Hono()
adminAnnouncementsRoutes.use('*', requireBearer, requireAdmin)

adminAnnouncementsRoutes.get('/', async (c) => {
  const rows = await db.select().from(announcements).orderBy(desc(announcements.createdAt))
  return c.json({ announcements: rows })
})

adminAnnouncementsRoutes.post('/', zValidator('json', z.object({
  title: z.string().min(1),
  body: z.string().optional().default(''),
  severity: z.enum(['info', 'warn', 'err']).optional().default('info'),
  pinned: z.boolean().optional().default(false),
  visible: z.boolean().optional().default(true),
  expires_at: z.string().optional(),
})), async (c) => {
  const b = c.req.valid('json')
  const [row] = await db.insert(announcements).values({
    title: b.title,
    body: b.body,
    severity: b.severity,
    pinned: b.pinned,
    visible: b.visible,
    expiresAt: b.expires_at ? new Date(b.expires_at) : null,
  }).returning()
  return c.json(row!, 201)
})

adminAnnouncementsRoutes.patch('/:id', zValidator('json', z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  severity: z.enum(['info', 'warn', 'err']).optional(),
  pinned: z.boolean().optional(),
  visible: z.boolean().optional(),
  expires_at: z.string().nullable().optional(),
})), async (c) => {
  const b = c.req.valid('json')
  const p: Record<string, unknown> = {}
  if (b.title !== undefined) p.title = b.title
  if (b.body !== undefined) p.body = b.body
  if (b.severity !== undefined) p.severity = b.severity
  if (b.pinned !== undefined) p.pinned = b.pinned
  if (b.visible !== undefined) p.visible = b.visible
  if (b.expires_at !== undefined) p.expiresAt = b.expires_at ? new Date(b.expires_at) : null
  const [row] = await db.update(announcements).set(p).where(eq(announcements.id, c.req.param('id'))).returning()
  if (!row) throw new AppError('not_found')
  return c.json(row)
})

adminAnnouncementsRoutes.delete('/:id', async (c) => {
  await db.delete(announcements).where(eq(announcements.id, c.req.param('id')))
  return c.json({ ok: true })
})
