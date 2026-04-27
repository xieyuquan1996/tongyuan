// backend/src/middleware/error.ts
import type { Context, Next } from 'hono'
import { AppError, toErrorBody } from '../shared/errors.js'

export async function errorMiddleware(c: Context, next: Next) {
  try {
    await next()
  } catch (err) {
    const body = toErrorBody(err)
    const status = err instanceof AppError ? err.status : 500
    return c.json(body, status as any)
  }
}
