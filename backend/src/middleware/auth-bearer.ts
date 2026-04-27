// backend/src/middleware/auth-bearer.ts
import type { MiddlewareHandler } from 'hono'
import { AppError } from '../shared/errors.js'
import { resolveSession } from '../services/sessions.js'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import type { UserRow } from '../services/users.js'

declare module 'hono' {
  interface ContextVariableMap {
    user: UserRow
    sessionToken: string
  }
}

export const requireBearer: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  if (!m) throw new AppError('unauthorized')
  const token = m[1]!
  const session = await resolveSession(token)
  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) })
  if (!user) throw new AppError('unauthorized')
  if (user.status === 'suspended') throw new AppError('account_suspended')
  c.set('user', user)
  c.set('sessionToken', token)
  await next()
}
