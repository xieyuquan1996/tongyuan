// backend/src/middleware/auth-api-key.ts
import type { MiddlewareHandler } from 'hono'
import { AppError } from '../shared/errors.js'
import { resolveKey } from '../services/api-keys.js'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import type { ApiKeyRow } from '../services/api-keys.js'
import type { UserRow } from '../services/users.js'

declare module 'hono' {
  interface ContextVariableMap {
    apiKey: ApiKeyRow
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
  const key = await resolveKey(secret)
  const user = await db.query.users.findFirst({ where: eq(users.id, key.userId) })
  if (!user) throw new AppError('unauthorized')
  if (user.status === 'suspended') throw new AppError('account_suspended')
  if (Number(user.balanceUsd) <= 0) throw new AppError('insufficient_balance')
  c.set('apiKey', key)
  c.set('user', user as UserRow)
  await next()
}
