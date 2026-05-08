// backend/src/middleware/rate-limit.ts
import type { MiddlewareHandler, Context } from 'hono'
import { redis } from '../redis/client.js'
import { env } from '../env.js'
import { RateLimitError } from '../shared/errors.js'

export const DEFAULT_RPM = 60

export type BucketSpec = {
  key: string   // stable identifier (e.g., apiKey.id) — no per-minute suffix
  limit: number // requests per minute = token bucket capacity
}

// Token bucket via Redis HASH. Capacity = limit tokens, refill rate = limit/min.
// The Lua script is atomic: read → refill → check → deduct, all in one EVAL.
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now_ms = tonumber(ARGV[4])

local state = redis.call('HMGET', key, 'tokens', 'last_ms')
local tokens = tonumber(state[1])
local last_ms = tonumber(state[2])

if not tokens or not last_ms then
  tokens = capacity
  last_ms = now_ms
end

local elapsed = math.max(0, now_ms - last_ms)
tokens = math.min(capacity, tokens + elapsed * rate)

local ttl_ms = math.ceil(capacity / rate * 2)

if tokens < cost then
  redis.call('HSET', key, 'tokens', tokens, 'last_ms', now_ms)
  redis.call('PEXPIRE', key, ttl_ms)
  local retry_after_ms = math.ceil((cost - tokens) / rate)
  return {0, retry_after_ms, math.floor(tokens)}
end

tokens = tokens - cost
redis.call('HSET', key, 'tokens', tokens, 'last_ms', now_ms)
redis.call('PEXPIRE', key, ttl_ms)
return {1, 0, math.floor(tokens)}
`

export function rateLimit(getBucket: (c: Context) => BucketSpec): MiddlewareHandler {
  return async (c, next) => {
    if (env.DISABLE_USER_QUOTA) return next()
    const { key, limit } = getBucket(c)
    const redisKey = `rl:tb:${key}`
    const ratePerMs = limit / 60_000  // tokens refilled per millisecond

    const result = (await redis.eval(
      TOKEN_BUCKET_LUA,
      1,
      redisKey,
      String(limit),
      String(ratePerMs),
      '1',              // cost = 1 request
      String(Date.now()),
    )) as [number, number, number]

    const [allowed, retryAfterMs, remaining] = result
    if (allowed !== 1) {
      const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000))
      throw new RateLimitError(
        `Rate limit exceeded: ${limit} RPM. Retry after ${retryAfterSec}s.`,
        { retryAfterSec, limitRequests: limit, remainingRequests: remaining },
      )
    }
    await next()
  }
}
