// Redis-backed admission control for upstream Anthropic keys.
//
// Anthropic publishes per-family (Opus/Sonnet/Haiku) per-minute budgets:
//   RPM (requests per minute), ITPM (input tokens per minute, excl cache reads),
//   OTPM (output tokens per minute).
//
// We keep a fixed-window counter per upstream-key × family × minute, and
// *reserve* budget before dispatching a request. After the response we
// reconcile the estimate with the true token count. Failed requests release
// their reservation.
//
// Why fixed window instead of token bucket: Anthropic's limits are stated as
// "per minute", they reset on minute boundaries. Matching their clock is what
// prevents us from either over-throttling or accidentally sliding into the
// next window while they haven't reset yet.

import { redis } from '../redis/client.js'
import type { Family, FamilyBudget } from './family.js'

const KEY_TTL_SEC = 120 // 2 windows — covers clock skew + late commits
const COOLDOWN_TTL_SEC = 120

function windowBucket(now = Date.now()): number {
  return Math.floor(now / 60_000)
}

function msUntilNextMinute(now = Date.now()): number {
  return 60_000 - (now % 60_000)
}

function qKey(upstreamId: string, family: Family, bucket: number, metric: 'req' | 'in' | 'out') {
  return `q:${upstreamId}:${family}:${bucket}:${metric}`
}

function cooldownKey(upstreamId: string, family: Family) {
  return `q:cd:${upstreamId}:${family}`
}

// Atomic reserve. Checks RPM/ITPM/OTPM against the current window; on success,
// increments all three. Returns the reason if it fails so the caller can log
// and try the next key.
//
// Implemented with EVAL so the three reads + three writes happen as a unit —
// otherwise two concurrent requests could each see headroom and both succeed.
const RESERVE_LUA = `
local cooldown = redis.call('GET', KEYS[4])
if cooldown then return {0, 'cooldown', cooldown} end

local req = tonumber(redis.call('GET', KEYS[1]) or '0')
local inTok = tonumber(redis.call('GET', KEYS[2]) or '0')
local outTok = tonumber(redis.call('GET', KEYS[3]) or '0')

local estIn = tonumber(ARGV[1])
local estOut = tonumber(ARGV[2])
local rpm = tonumber(ARGV[3])
local itpm = tonumber(ARGV[4])
local otpm = tonumber(ARGV[5])
local ttl = tonumber(ARGV[6])

if req + 1 > rpm then return {0, 'rpm', ''} end
if inTok + estIn > itpm then return {0, 'itpm', ''} end
if outTok + estOut > otpm then return {0, 'otpm', ''} end

redis.call('INCRBY', KEYS[1], 1)
redis.call('INCRBY', KEYS[2], estIn)
redis.call('INCRBY', KEYS[3], estOut)
redis.call('EXPIRE', KEYS[1], ttl)
redis.call('EXPIRE', KEYS[2], ttl)
redis.call('EXPIRE', KEYS[3], ttl)
return {1, 'ok', ''}
`

export type ReserveResult =
  | { ok: true; bucket: number; estIn: number; estOut: number }
  | { ok: false; reason: 'rpm' | 'itpm' | 'otpm' | 'cooldown'; retryAfterMs: number }

export async function reserve(
  upstreamId: string,
  family: Family,
  budget: FamilyBudget,
  estIn: number,
  estOut: number,
): Promise<ReserveResult> {
  const bucket = windowBucket()
  const result = (await redis.eval(
    RESERVE_LUA,
    4,
    qKey(upstreamId, family, bucket, 'req'),
    qKey(upstreamId, family, bucket, 'in'),
    qKey(upstreamId, family, bucket, 'out'),
    cooldownKey(upstreamId, family),
    String(estIn),
    String(estOut),
    String(budget.rpm),
    String(budget.itpmExclCache),
    String(budget.otpm),
    String(KEY_TTL_SEC),
  )) as [number, string, string]

  const [ok, reason] = result
  if (ok === 1) return { ok: true, bucket, estIn, estOut }
  if (reason === 'cooldown') {
    // The cooldown value is "<expiry-ms-epoch>"; compute retryAfter from it.
    const retryAfterMs = Math.max(0, Number(result[2]) - Date.now())
    return { ok: false, reason: 'cooldown', retryAfterMs }
  }
  return { ok: false, reason: reason as 'rpm' | 'itpm' | 'otpm', retryAfterMs: msUntilNextMinute() }
}

// After the upstream responds, correct the estimate with the true count. If
// the request failed in flight, pass realIn=realOut=0 so we release the full
// reservation.
export async function commit(
  upstreamId: string,
  family: Family,
  bucket: number,
  estIn: number,
  estOut: number,
  realIn: number,
  realOut: number,
): Promise<void> {
  const deltaIn = realIn - estIn
  const deltaOut = realOut - estOut
  const pipe = redis.pipeline()
  if (deltaIn !== 0) pipe.incrby(qKey(upstreamId, family, bucket, 'in'), deltaIn)
  if (deltaOut !== 0) pipe.incrby(qKey(upstreamId, family, bucket, 'out'), deltaOut)
  // Refresh TTL so a late commit doesn't leave a stale orphan counter.
  pipe.expire(qKey(upstreamId, family, bucket, 'req'), KEY_TTL_SEC)
  pipe.expire(qKey(upstreamId, family, bucket, 'in'), KEY_TTL_SEC)
  pipe.expire(qKey(upstreamId, family, bucket, 'out'), KEY_TTL_SEC)
  await pipe.exec()
}

// Release the full reservation (request was never sent or failed pre-auth).
export async function release(
  upstreamId: string,
  family: Family,
  bucket: number,
  estIn: number,
  estOut: number,
): Promise<void> {
  const pipe = redis.pipeline()
  pipe.incrby(qKey(upstreamId, family, bucket, 'req'), -1)
  pipe.incrby(qKey(upstreamId, family, bucket, 'in'), -estIn)
  pipe.incrby(qKey(upstreamId, family, bucket, 'out'), -estOut)
  await pipe.exec()
}

// Park a key × family combo until a wall-clock time. Used when the upstream
// returns 429 with a retry-after / anthropic-ratelimit-*-reset header — the
// key's other families are still usable, just not this one.
export async function markFamilyCooldown(
  upstreamId: string,
  family: Family,
  untilMs: number,
  reason: string,
): Promise<void> {
  const ttlSec = Math.min(COOLDOWN_TTL_SEC, Math.max(1, Math.ceil((untilMs - Date.now()) / 1000)))
  await redis.set(cooldownKey(upstreamId, family), String(untilMs), 'EX', ttlSec)
  // Attach the reason for debugging via a sibling key (not on critical path).
  await redis.set(cooldownKey(upstreamId, family) + ':why', reason, 'EX', ttlSec).catch(() => {})
}

export async function isFamilyCoolingDown(upstreamId: string, family: Family): Promise<number | null> {
  const v = await redis.get(cooldownKey(upstreamId, family))
  if (!v) return null
  const until = Number(v)
  if (!Number.isFinite(until) || until <= Date.now()) return null
  return until
}

// Read current-window counters for observability. Returns 0s if never set.
export async function snapshotFamily(
  upstreamId: string,
  family: Family,
): Promise<{ bucket: number; req: number; inTok: number; outTok: number; cooldownUntil: number | null }> {
  const bucket = windowBucket()
  const [req, inTok, outTok, cd] = await redis.mget(
    qKey(upstreamId, family, bucket, 'req'),
    qKey(upstreamId, family, bucket, 'in'),
    qKey(upstreamId, family, bucket, 'out'),
    cooldownKey(upstreamId, family),
  )
  return {
    bucket,
    req: Number(req ?? 0),
    inTok: Number(inTok ?? 0),
    outTok: Number(outTok ?? 0),
    cooldownUntil: cd ? Number(cd) : null,
  }
}
