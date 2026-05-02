// backend/src/middleware/auth-api-key.ts
import type { MiddlewareHandler } from 'hono'
import { AppError } from '../shared/errors.js'
import { resolveKey, touchLastUsed } from '../services/api-keys.js'
import { delCached } from '../services/api-key-cache.js'
import { hmacApiKey } from '../crypto/apikey-hmac.js'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import type { ApiKeyRow } from '../services/api-keys.js'
import type { UserRow } from '../services/users.js'

declare module 'hono' {
  interface ContextVariableMap {
    apiKey: ApiKeyRow
    // `user: UserRow` is also declared in auth-bearer.ts; TS merges the two augmentations.
    user: UserRow
  }
}

function extractSecret(c: any): string | null {
  const xApi = c.req.header('x-api-key')
  if (xApi) return xApi.trim()
  const auth = c.req.header('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  return m ? m[1]!.trim() : null
}

export const requireApiKey: MiddlewareHandler = async (c, next) => {
  const secret = extractSecret(c)
  if (!secret || !secret.startsWith('sk-relay-')) throw new AppError('unauthorized')
  let key = await resolveKey(secret)
  let user = await db.query.users.findFirst({ where: eq(users.id, key.userId) })
  if (!user) {
    // resolveKey may have returned a stale cached pointer to an api_keys row
    // whose user has been cascade-deleted (e.g. the failover test reuses a
    // hardcoded secret across runs). Drop the cache and retry once against
    // the DB before giving up.
    await delCached(hmacApiKey(secret))
    key = await resolveKey(secret)
    user = await db.query.users.findFirst({ where: eq(users.id, key.userId) })
    if (!user) throw new AppError('unauthorized')
  }
  if (user.status === 'suspended') throw new AppError('account_suspended')
  if (Number(user.balanceUsd) <= 0) throw new AppError('insufficient_balance')
  c.set('apiKey', key)
  c.set('user', user as UserRow)
  // Fire-and-forget: don't block the request on the bookkeeping write. The
  // service layer already throttles to ≤1 UPDATE per key per minute via a
  // SQL gate, so even hot keys won't churn the row.
  touchLastUsed(key.id).catch(() => {})
  await next()
}
