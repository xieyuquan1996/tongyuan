// backend/src/middleware/error.ts
import type { Context, Next } from 'hono'
import { AppError, toErrorBody } from '../shared/errors.js'

function getStatus(err: unknown): number {
  if (err instanceof AppError) return err.status
  // duck-type fallback for ESM module instance mismatch in tests
  const e = err as any
  if (e && typeof e.status === 'number' && typeof e.code === 'string') return e.status
  return 500
}

export async function errorMiddleware(c: Context, next: Next) {
  try {
    await next()
  } catch (err) {
    const body = toErrorBody(err)
    const status = getStatus(err)
    return c.json(body, status as any)
  }
}
