// backend/src/services/api-keys.ts
import { eq, and, desc, isNull, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '../db/client.js'
import { apiKeys } from '../db/schema.js'
import { newApiKey } from '../crypto/tokens.js'
import { hmacApiKey } from '../crypto/apikey-hmac.js'
import { AppError } from '../shared/errors.js'
import { delCached, getCached, setCached, type CachedApiKey } from './api-key-cache.js'

export type ApiKeyRow = typeof apiKeys.$inferSelect

export function toPublicKey(row: ApiKeyRow) {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    prefix: row.prefix,
    state: row.state,
    rpm_limit: row.rpmLimit,
    tpm_limit: row.tpmLimit,
    created_at: row.createdAt,
    last_used_at: row.lastUsedAt,
    revoked_at: row.revokedAt,
  }
}

function rowToCached(row: ApiKeyRow): CachedApiKey {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    prefix: row.prefix,
    state: row.state,
    rpmLimit: row.rpmLimit as string | null,
    tpmLimit: row.tpmLimit as string | null,
  }
}

export async function createKey(userId: string, name: string) {
  const { secret, prefix } = newApiKey()
  const secretHmac = hmacApiKey(secret)
  // Skip bcrypt entirely for new keys — HMAC is the primary fingerprint now.
  // secret_hash stays NULL; the column is nullable as of migration 0015.
  const [row] = await db.insert(apiKeys)
    .values({ userId, name, prefix, secretHmac })
    .returning()
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
  // Drop the cache entry so the very next request sees the revocation,
  // instead of waiting up to TTL_SEC for it to expire naturally.
  if (row.secretHmac) await delCached(row.secretHmac)
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

// Resolve a presented `sk-relay-...` secret to its api_keys row. The path is:
//
//   1) Redis cache by HMAC      → hit, done
//   2) Postgres WHERE secret_hmac = $hmac AND state = 'active'  → hit, cache, done
//   3) Legacy bcrypt fallback over rows with NULL secret_hmac and matching prefix
//      → on success, fill in secret_hmac so future verifies take the fast path
//
// Step 3 only runs for keys minted before migration 0015. After each legacy
// key is used once, it's lazy-migrated; eventually step 3 stops firing.
export async function resolveKey(secret: string): Promise<ApiKeyRow> {
  if (!secret.startsWith('sk-relay-')) throw new AppError('unauthorized')
  const hmac = hmacApiKey(secret)

  const cached = await getCached(hmac)
  if (cached) {
    if (cached.state !== 'active') throw new AppError('unauthorized')
    // Reconstruct enough of an ApiKeyRow for callers. lastUsedAt/createdAt
    // aren't on the auth hot path; if a caller really needs them they can
    // re-fetch by id. We keep the cached shape minimal so cache TTL works.
    return {
      id: cached.id,
      userId: cached.userId,
      name: cached.name,
      prefix: cached.prefix,
      secretHash: null,
      secretHmac: hmac,
      state: cached.state,
      rpmLimit: cached.rpmLimit,
      tpmLimit: cached.tpmLimit,
      createdAt: new Date(0),
      lastUsedAt: null,
      revokedAt: null,
    } as ApiKeyRow
  }

  // Fast path: HMAC equality → unique index hit.
  const [byHmac] = await db.select().from(apiKeys)
    .where(and(eq(apiKeys.secretHmac, hmac), eq(apiKeys.state, 'active')))
    .limit(1)
  if (byHmac) {
    await setCached(hmac, rowToCached(byHmac))
    return byHmac
  }

  // Legacy slow path: rows that haven't been migrated to HMAC yet. Scope to
  // the secret's prefix and to rows with no HMAC, so we don't bcrypt against
  // already-migrated rows.
  const prefix = secret.slice(0, 16)
  const candidates = await db.select().from(apiKeys)
    .where(and(
      eq(apiKeys.prefix, prefix),
      eq(apiKeys.state, 'active'),
      isNull(apiKeys.secretHmac),
    ))
  for (const cand of candidates) {
    if (!cand.secretHash) continue
    if (await bcrypt.compare(secret, cand.secretHash)) {
      // Lazy-migrate: fill in the HMAC so this row joins the fast path next
      // time. We also drop the bcrypt hash since HMAC is now the source of
      // truth. CAS-style WHERE clause prevents two concurrent verifies from
      // racing on the migration.
      await db.update(apiKeys)
        .set({ secretHmac: hmac, secretHash: null })
        .where(and(eq(apiKeys.id, cand.id), isNull(apiKeys.secretHmac)))
      const migrated = { ...cand, secretHmac: hmac, secretHash: null }
      await setCached(hmac, rowToCached(migrated))
      return migrated
    }
  }

  throw new AppError('unauthorized')
}

// Update last_used_at without blocking the request path. Throttled so a
// chatty client doesn't generate one UPDATE per call: we only touch the
// row if our last update is at least THROTTLE_MS old. The throttle uses
// the api_keys row itself rather than Redis to keep the gate atomic with
// the write.
const TOUCH_THROTTLE_MS = 60_000

export async function touchLastUsed(id: string): Promise<void> {
  // `WHERE last_used_at IS NULL OR last_used_at < now() - interval`
  // means at most one UPDATE per minute per key, regardless of how many
  // concurrent requests fired touchLastUsed.
  await db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(and(
      eq(apiKeys.id, id),
      sql`(${apiKeys.lastUsedAt} IS NULL OR ${apiKeys.lastUsedAt} < now() - interval '${sql.raw(String(TOUCH_THROTTLE_MS))} milliseconds')`,
    ))
}

// Patch a key's user-editable fields (name + RPM/TPM limits). Returns the
// new row. Drops the cache so the next auth picks up the new limits without
// waiting for TTL.
export type PatchKeyInput = {
  name?: string
  rpmLimit?: number | null
  tpmLimit?: number | null
}

export async function patchKey(userId: string, id: string, p: PatchKeyInput): Promise<ApiKeyRow> {
  const set: Record<string, unknown> = {}
  if (p.name !== undefined) set.name = p.name
  if (p.rpmLimit !== undefined) set.rpmLimit = p.rpmLimit === null ? null : String(p.rpmLimit)
  if (p.tpmLimit !== undefined) set.tpmLimit = p.tpmLimit === null ? null : String(p.tpmLimit)
  if (Object.keys(set).length === 0) {
    const existing = await db.query.apiKeys.findFirst({
      where: and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)),
    })
    if (!existing) throw new AppError('not_found')
    return existing
  }
  const [row] = await db.update(apiKeys)
    .set(set)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
    .returning()
  if (!row) throw new AppError('not_found')
  if (row.secretHmac) await delCached(row.secretHmac)
  return row
}
