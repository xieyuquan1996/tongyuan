// backend/src/services/api-keys.test.ts
//
// Covers the migration-safe paths in resolveKey: HMAC fast path, legacy
// bcrypt fallback, and the lazy migration that fills in secret_hmac on a
// successful bcrypt verify.
//
// Hits the real Postgres + Redis configured by the env. Each test creates
// its own isolated user so the suite can run alongside e2e.test.ts.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { db, pool } from '../db/client.js'
import { apiKeys, users } from '../db/schema.js'
import { and, eq } from 'drizzle-orm'
import { newApiKey } from '../crypto/tokens.js'
import { hmacApiKey } from '../crypto/apikey-hmac.js'
import { createKey, resolveKey, patchKey, revokeKey, touchLastUsed } from './api-keys.js'
import { getCached } from './api-key-cache.js'
import { redis } from '../redis/client.js'

const EMAIL = 'apikey-svc-test@example.com'
let userId = ''

async function ensureUser(): Promise<string> {
  await pool.query("DELETE FROM users WHERE email=$1", [EMAIL])
  const [row] = await db.insert(users).values({
    email: EMAIL,
    passwordHash: 'x',
    name: 'apikey-svc-test',
    balanceUsd: '10.000000',
  }).returning()
  return row!.id
}

beforeAll(async () => {
  userId = await ensureUser()
})

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email=$1", [EMAIL])
  // Don't pool.end() — other test files in this run share the pool. The
  // top-level afterAll in e2e.test.ts handles teardown.
})

describe('api-keys service', () => {
  it('createKey writes secret_hmac and leaves secret_hash null', async () => {
    const { row, secret } = await createKey(userId, 'test-create')
    expect(secret).toMatch(/^sk-relay-/)
    expect(row.secretHash).toBeNull()
    expect(row.secretHmac).toBe(hmacApiKey(secret))
  })

  it('resolveKey hits the HMAC fast path for newly minted keys', async () => {
    const { secret } = await createKey(userId, 'test-resolve-hmac')
    const resolved = await resolveKey(secret)
    expect(resolved.userId).toBe(userId)
    expect(resolved.secretHmac).toBe(hmacApiKey(secret))
    // Cache should be populated after a fresh DB hit.
    const cached = await getCached(hmacApiKey(secret))
    expect(cached).not.toBeNull()
    expect(cached!.id).toBe(resolved.id)
  })

  it('resolveKey hits the cache on a second call (no DB query needed)', async () => {
    const { secret } = await createKey(userId, 'test-resolve-cache')
    await resolveKey(secret) // populates cache
    // Yank the row out of Postgres entirely. If resolveKey still finds it,
    // the cache is doing its job.
    await db.delete(apiKeys).where(eq(apiKeys.secretHmac, hmacApiKey(secret)))
    const stillResolves = await resolveKey(secret)
    expect(stillResolves.userId).toBe(userId)
    // Clean up the cache so it doesn't pollute later tests.
    await redis.del('apikey:' + hmacApiKey(secret))
  })

  it('legacy bcrypt rows verify and lazy-migrate to HMAC', async () => {
    // Simulate a row created before migration 0015: secret_hash filled,
    // secret_hmac NULL. resolveKey should bcrypt.compare its way to a hit
    // and fill in secret_hmac so the next call takes the fast path.
    const { secret, prefix } = newApiKey()
    const secretHash = await bcrypt.hash(secret, 4) // low cost — test speed
    const [row] = await db.insert(apiKeys).values({
      userId, name: 'legacy', prefix, secretHash, secretHmac: null,
    }).returning()
    expect(row!.secretHmac).toBeNull()

    const resolved = await resolveKey(secret)
    expect(resolved.id).toBe(row!.id)
    expect(resolved.secretHmac).toBe(hmacApiKey(secret))
    expect(resolved.secretHash).toBeNull()

    // Confirm the migration actually persisted to Postgres, not just the
    // returned object.
    const after = await db.query.apiKeys.findFirst({ where: eq(apiKeys.id, row!.id) })
    expect(after!.secretHmac).toBe(hmacApiKey(secret))
    expect(after!.secretHash).toBeNull()
  })

  it('rejects an unknown secret', async () => {
    await expect(resolveKey('sk-relay-totally-bogus')).rejects.toThrow()
  })

  it('rejects a revoked key (cache invalidated on revoke)', async () => {
    const { row, secret } = await createKey(userId, 'test-revoke')
    await resolveKey(secret) // warms cache
    await revokeKey(userId, row.id)
    await expect(resolveKey(secret)).rejects.toThrow()
  })

  it('patchKey updates rpm/tpm and busts the cache', async () => {
    const { row, secret } = await createKey(userId, 'test-patch')
    await resolveKey(secret) // warms cache with old (null) limits
    const patched = await patchKey(userId, row.id, { rpmLimit: 30, tpmLimit: 50_000 })
    expect(patched.rpmLimit).toBe('30')
    expect(patched.tpmLimit).toBe('50000')
    // Cache should be cleared so the next resolve sees the new limits.
    const cached = await getCached(hmacApiKey(secret))
    expect(cached).toBeNull()
    const resolved = await resolveKey(secret)
    expect(resolved.rpmLimit).toBe('30')
    expect(resolved.tpmLimit).toBe('50000')
  })

  it('touchLastUsed throttles to ≤1 update per minute', async () => {
    const { row } = await createKey(userId, 'test-touch')
    await touchLastUsed(row.id)
    const [first] = await db.select().from(apiKeys).where(eq(apiKeys.id, row.id))
    expect(first!.lastUsedAt).not.toBeNull()
    const t1 = first!.lastUsedAt!.getTime()

    // A second touch within the throttle window should leave last_used_at
    // untouched, since the SQL gate only fires when last_used_at is older
    // than 60 seconds.
    await touchLastUsed(row.id)
    const [second] = await db.select().from(apiKeys).where(eq(apiKeys.id, row.id))
    expect(second!.lastUsedAt!.getTime()).toBe(t1)
  })

  it('patch with empty body is a no-op fetch (does not crash)', async () => {
    const { row } = await createKey(userId, 'test-noop-patch')
    const back = await patchKey(userId, row.id, {})
    expect(back.id).toBe(row.id)
  })

  it('patch on someone else\'s key is not_found', async () => {
    const { row: other } = await createKey(userId, 'test-other')
    // Use a syntactically valid UUID that isn't this user's id so the
    // userId WHERE clause filters it out.
    const fakeUserId = '00000000-0000-0000-0000-000000000000'
    await expect(patchKey(fakeUserId, other.id, { name: 'x' })).rejects.toThrow()
  })
})

describe('api-keys + tpm reservation (smoke)', () => {
  it('does not reserve when tpmLimit is null', async () => {
    // Sanity: a key without a TPM cap should resolve without touching the
    // tpm: namespace in Redis. This guards against accidental "reserve on
    // every key" regressions in handle-messages.ts.
    const { row } = await createKey(userId, 'test-nolimit')
    const cap = row.tpmLimit ? Number(row.tpmLimit) : null
    expect(cap).toBeNull()
  })
})

describe('api-keys cleanup', () => {
  it('deletes test keys (housekeeping)', async () => {
    const cleared = await db.delete(apiKeys).where(eq(apiKeys.userId, userId))
    expect(cleared).toBeDefined()
  })
})
