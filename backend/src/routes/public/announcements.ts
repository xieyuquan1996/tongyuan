// backend/src/routes/public/announcements.ts
import { Hono } from 'hono'
import { and, desc, eq, or, isNull, gte } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { announcements } from '../../db/schema.js'

export const publicAnnouncements = new Hono()

publicAnnouncements.get('/', async (c) => {
  const now = new Date()
  const rows = await db.select().from(announcements)
    .where(and(
      eq(announcements.visible, true),
      or(isNull(announcements.expiresAt), gte(announcements.expiresAt, now))
    ))
    .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
    .limit(5)
  return c.json({ announcements: rows })
})
