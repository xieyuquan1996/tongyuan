// backend/src/services/api-keys.ts
import { eq, and, desc } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '../db/client.js'
import { apiKeys } from '../db/schema.js'
import { newApiKey } from '../crypto/tokens.js'
import { AppError } from '../shared/errors.js'

export type ApiKeyRow = typeof apiKeys.$inferSelect

export function toPublicKey(row: ApiKeyRow) {
  const { secretHash: _omit, ...rest } = row
  return rest
}

export async function createKey(userId: string, name: string) {
  const { secret, prefix } = newApiKey()
  const secretHash = await bcrypt.hash(secret, 12)
  const [row] = await db.insert(apiKeys).values({ userId, name, prefix, secretHash }).returning()
  return { row: row!, secret }
}

export async function listKeys(userId: string) {
  return db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt))
}

export async function revokeKey(userId: string, id: string): Promise<ApiKeyRow> {
  const [row] = await db.update(apiKeys)
    .set({ state: 'revoked', revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
    .returning()
  if (!row) throw new AppError('not_found')
  return row
}

export async function ensurePlaygroundKey(userId: string): Promise<ApiKeyRow> {
  const existing = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.userId, userId), eq(apiKeys.name, 'playground'), eq(apiKeys.state, 'active')),
  })
  if (existing) return existing
  const { row } = await createKey(userId, 'playground')
  return row
}

export async function resolveKey(secret: string): Promise<ApiKeyRow> {
  if (!secret.startsWith('sk-relay-')) throw new AppError('unauthorized')
  const prefix = secret.slice(0, 16)
  const candidates = await db.select().from(apiKeys).where(and(eq(apiKeys.prefix, prefix), eq(apiKeys.state, 'active')))
  for (const c of candidates) {
    if (await bcrypt.compare(secret, c.secretHash)) {
      return c
    }
  }
  throw new AppError('unauthorized')
}
