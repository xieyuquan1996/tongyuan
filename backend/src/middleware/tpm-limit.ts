// Per-API-key TPM (tokens-per-minute) admission control via token bucket.
//
// Three operations:
//   reserve(apiKeyId, cap, estimate) — pre-flight: atomically deduct estimate.
//                                      Throws RateLimitError if bucket empty.
//   reconcile(reservation, actual)  — post-response: refund/charge the delta
//                                      between estimate and actual token usage.
//   release(reservation)            — request failed: refund the full estimate.

import { redis } from '../redis/client.js'
import { RateLimitError } from '../shared/errors.js'

// Atomic token bucket check-and-deduct. Same algorithm as rate-limit.ts but
// cost is variable (estimated token count instead of fixed 1).
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

// Adjust the bucket by (estimate - actual).
// Positive delta = over-estimated → refund tokens back.
// Negative delta = under-estimated → charge extra tokens.
// Capped between 0 and capacity.
const RECONCILE_LUA = `
local key = KEYS[1]
local delta = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local rate = tonumber(ARGV[3])

local raw = redis.call('HGET', key, 'tokens')
if not raw then return 0 end
local tokens = tonumber(raw)
local new_tokens = math.max(0, math.min(capacity, tokens + delta))
redis.call('HSET', key, 'tokens', new_tokens)
local ttl_ms = math.ceil(capacity / rate * 2)
redis.call('PEXPIRE', key, ttl_ms)
return math.floor(new_tokens)
`

export type TpmReservation = {
  apiKeyId: string
  estimate: number
  cap: number
}

function tpmKey(apiKeyId: string): string {
  return `rl:tpm:${apiKeyId}`
}

export async function reserve(apiKeyId: string, cap: number, estimate: number): Promise<TpmReservation> {
  const ratePerMs = cap / 60_000
  const result = (await redis.eval(
    TOKEN_BUCKET_LUA,
    1,
    tpmKey(apiKeyId),
    String(cap),
    String(ratePerMs),
    String(estimate),
    String(Date.now()),
  )) as [number, number, number]

  const [allowed, retryAfterMs, remaining] = result
  if (allowed !== 1) {
    const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000))
    throw new RateLimitError(
      `Rate limit exceeded: ${cap} TPM. Retry after ${retryAfterSec}s.`,
      { retryAfterSec, limitTokens: cap, remainingTokens: remaining },
    )
  }
  return { apiKeyId, estimate, cap }
}

export async function reconcile(reservation: TpmReservation, actual: number): Promise<void> {
  const delta = reservation.estimate - actual  // positive = refund, negative = extra charge
  if (delta === 0) return
  try {
    await redis.eval(
      RECONCILE_LUA,
      1,
      tpmKey(reservation.apiKeyId),
      String(delta),
      String(reservation.cap),
      String(reservation.cap / 60_000),
    )
  } catch {
    // Best-effort: a missed reconcile only over/under-counts for the TTL window.
  }
}

export async function release(reservation: TpmReservation): Promise<void> {
  await reconcile(reservation, 0)
}
