// backend/src/middleware/auth-admin.ts
import type { MiddlewareHandler } from 'hono'
import { AppError } from '../shared/errors.js'

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const u = c.get('user')
  if (!u || u.role !== 'admin') throw new AppError('forbidden')
  await next()
}
