// backend/src/middleware/rate-limit.ts
import type { MiddlewareHandler, Context } from 'hono'
import { redis } from '../redis/client.js'
import { AppError } from '../shared/errors.js'

export const DEFAULT_RPM = 60

export type BucketSpec = { key: string; limit: number; windowSec?: number }

// Fixed-window counter via INCR + EXPIRE. Per-minute granularity by default.
export function rateLimit(getBucket: (c: Context) => BucketSpec): MiddlewareHandler {
  return async (c, next) => {
    const { key, limit, windowSec = 60 } = getBucket(c)
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, windowSec)
    if (count > limit) {
      throw new AppError('rate_limit', `${limit} per ${windowSec}s`)
    }
    await next()
  }
}
