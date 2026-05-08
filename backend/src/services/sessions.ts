// backend/src/services/sessions.ts
import { eq, lt } from 'drizzle-orm'
import { db } from '../db/client.js'
import { sessions } from '../db/schema.js'
import { newSessionToken, hashSessionToken } from '../crypto/tokens.js'
import { AppError } from '../shared/errors.js'

const TTL_DAYS = 7
const MAX_LIFETIME_DAYS = 30
const REFRESH_THRESHOLD_MS = 24 * 3600 * 1000

export async function issueSession(userId: string) {
  const token = newSessionToken()
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 3600 * 1000)
  const [row] = await db.insert(sessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  }).returning()
  return { token, session: row! }
}

export async function resolveSession(token: string) {
  const row = await db.query.sessions.findFirst({
    where: eq(sessions.tokenHash, hashSessionToken(token)),
  })
  if (!row) throw new AppError('unauthorized')
  if (row.expiresAt < new Date()) throw new AppError('unauthorized')
  return row
}

export function shouldRefresh(expiresAt: Date): boolean {
  return expiresAt.getTime() - Date.now() < REFRESH_THRESHOLD_MS
}

// Sliding window: extend expiry by TTL_DAYS, capped at MAX_LIFETIME_DAYS from creation.
export async function touchSession(sessionId: string, createdAt: Date): Promise<void> {
  const absoluteMax = createdAt.getTime() + MAX_LIFETIME_DAYS * 24 * 3600 * 1000
  const newExpiry = Math.min(Date.now() + TTL_DAYS * 24 * 3600 * 1000, absoluteMax)
  await db.update(sessions)
    .set({ expiresAt: new Date(newExpiry) })
    .where(eq(sessions.id, sessionId))
}

export async function revokeSession(token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)))
}

export async function purgeExpired() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
}
