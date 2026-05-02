// Per-API-key TPM (tokens-per-minute) admission control.
//
// Mirrors the upstream-quota Lua pattern (gateway/quota.ts): we need an
// atomic "check-and-increment" so two concurrent requests can't both see
// headroom and slip past the ceiling. Without this, a burst of N requests
// arriving inside the same millisecond would all admit even when the limit
// is 1.
//
// Flow (called by the /v1/messages handler, after requireApiKey + after
// the body has been parsed):
//   1) reserve()  — pre-flight estimate (input + output). If admitting
//                   would exceed tpm_limit, throw rate_limit.
//   2) reconcile() — at biller commit time, adjust the bucket by
//                    (actual - estimate). Released fully on failure.
//
// Counters live in a fixed minute window keyed by `tpm:keyId:bucket`. We
// don't bother with sliding window — the upstream limits are also stated
// per-minute, and matching their clock is what users expect.

import { redis } from '../redis/client.js'
import { AppError } from '../shared/errors.js'

const KEY_TTL_SEC = 120 // covers clock skew + late commits

function bucketNow(now = Date.now()): number {
  return Math.floor(now / 60_000)
}

function tpmKey(apiKeyId: string, bucket: number): string {
  return `tpm:${apiKeyId}:${bucket}`
}

// Atomic check-and-increment. Returns 1 on admission, 0 on reject. The Lua
// avoids the increment-then-rollback race where N parallel callers all add
// past the ceiling and then all decrement back, denying everyone.
const RESERVE_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local estimate = tonumber(ARGV[1])
local cap = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
if current + estimate > cap then
  return 0
end
redis.call('INCRBY', KEYS[1], estimate)
redis.call('EXPIRE', KEYS[1], ttl)
return 1
`

export type TpmReservation = {
  apiKeyId: string
  bucket: number
  estimate: number
  cap: number
}

// Reserve `estimate` tokens against this minute's bucket. Throws rate_limit
// if it would exceed the cap. Caller is responsible for reconciling or
// releasing — leaking a reservation only over-counts for one minute, but
// it's still worth wiring properly.
export async function reserve(apiKeyId: string, cap: number, estimate: number): Promise<TpmReservation> {
  const bucket = bucketNow()
  const ok = await redis.eval(
    RESERVE_LUA,
    1,
    tpmKey(apiKeyId, bucket),
    String(estimate),
    String(cap),
    String(KEY_TTL_SEC),
  ) as number
  if (ok !== 1) {
    throw new AppError('rate_limit', `tpm exceeded (limit ${cap}/min)`)
  }
  return { apiKeyId, bucket, estimate, cap }
}

// Adjust the bucket by (actual - estimate). Called from biller after the
// upstream returns authoritative usage. Negative deltas (over-reserved)
// hand budget back to other in-flight requests.
export async function reconcile(reservation: TpmReservation, actual: number): Promise<void> {
  const delta = actual - reservation.estimate
  if (delta === 0) return
  try {
    await redis.incrby(tpmKey(reservation.apiKeyId, reservation.bucket), delta)
  } catch {
    // Reconciliation is best-effort — a missed reconcile only over- or
    // under-counts a single request's usage for one minute.
  }
}

// Release the full reservation (request was rejected before reaching upstream
// or the connection died pre-response). Equivalent to reconcile(_, 0) but
// reads more clearly at call sites.
export async function release(reservation: TpmReservation): Promise<void> {
  await reconcile(reservation, 0)
}
