import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { alerts } from '../db/schema.js'
import { AppError } from '../shared/errors.js'

export type AlertRow = typeof alerts.$inferSelect

export async function list(userId: string) {
  return db.select().from(alerts).where(eq(alerts.userId, userId))
}

export async function create(userId: string, input: { kind: string; threshold: string; channel: string; enabled: boolean }) {
  const [row] = await db.insert(alerts).values({ userId, ...input }).returning()
  return row!
}

export async function patch(userId: string, id: string, p: Partial<Pick<AlertRow, 'threshold' | 'channel' | 'enabled'>>) {
  const [row] = await db.update(alerts).set(p).where(and(eq(alerts.id, id), eq(alerts.userId, userId))).returning()
  if (!row) throw new AppError('not_found')
  return row
}

export async function remove(userId: string, id: string) {
  const [row] = await db.delete(alerts).where(and(eq(alerts.id, id), eq(alerts.userId, userId))).returning()
  if (!row) throw new AppError('not_found')
}
