// Redis-backed cache for resolved API keys.
//
// The auth path runs on every /v1/messages request and historically did:
//   1) prefix lookup over api_keys
//   2) bcrypt.compare for each row that shared the prefix
//   3) follow-up SELECT on users
//
// With this cache, a hit collapses (1)+(2) to a single Redis GET. We key by
// the HMAC fingerprint (never the plaintext) so cache invalidation on revoke
// can reuse the same key without needing the secret to be presented again.
//
// What we deliberately do NOT cache: balance, monthly limit. Those change on
// every billed request and have to read from Postgres each time. The user row
// is fetched fresh on every auth call regardless — only the api_keys row
// (which mutates rarely: state changes, RPM/TPM tweaks) is cached.

import { redis } from '../redis/client.js'

const TTL_SEC = 5 * 60
const PREFIX = 'apikey:'

export type CachedApiKey = {
  id: string
  userId: string
  name: string
  prefix: string
  state: string
  // numeric limits come back from pg as strings; keep them as strings here so
  // the cache encodes the same shape the DB row carries.
  rpmLimit: string | null
  tpmLimit: string | null
}

function cacheKey(hmac: string): string {
  return PREFIX + hmac
}

export async function getCached(hmac: string): Promise<CachedApiKey | null> {
  try {
    const raw = await redis.get(cacheKey(hmac))
    if (!raw) return null
    return JSON.parse(raw) as CachedApiKey
  } catch {
    // Treat any cache failure (parse error, dropped Redis conn) as a miss
    // rather than a hard auth failure. The DB path is the source of truth.
    return null
  }
}

export async function setCached(hmac: string, row: CachedApiKey): Promise<void> {
  try {
    await redis.set(cacheKey(hmac), JSON.stringify(row), 'EX', TTL_SEC)
  } catch {
    // Cache writes are best-effort.
  }
}

export async function delCached(hmac: string): Promise<void> {
  try {
    await redis.del(cacheKey(hmac))
  } catch {
    // Best-effort: a stale cache entry will expire within TTL_SEC anyway,
    // and the DB row's `state` is still rechecked on cache miss.
  }
}
