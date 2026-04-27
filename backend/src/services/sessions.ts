// backend/src/services/sessions.ts
import { eq, lt } from 'drizzle-orm'
import { db } from '../db/client.js'
import { sessions } from '../db/schema.js'
import { newSessionToken, hashSessionToken } from '../crypto/tokens.js'
import { AppError } from '../shared/errors.js'

const TTL_DAYS = 30

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

export async function revokeSession(token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)))
}

export async function purgeExpired() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
}
