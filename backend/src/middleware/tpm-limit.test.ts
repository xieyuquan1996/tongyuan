// Atomic-reservation smoke tests for the per-key TPM limiter.
//
// These hit Redis directly (via the Lua script) without going through the
// /v1/messages handler, so they're fast and deterministic. The integration
// behavior — reserve at request entry, reconcile in commit — is exercised
// indirectly by e2e.test.ts.

import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { reserve, reconcile, release } from './tpm-limit.js'
import { redis } from '../redis/client.js'
import { AppError } from '../shared/errors.js'

const KEY_ID = `tpm-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function clearBuckets() {
  // Clear every minute bucket we might have touched, plus a couple of
  // adjacent ones in case the test crosses a minute boundary.
  const keys = await redis.keys(`tpm:${KEY_ID}:*`)
  if (keys.length) await redis.del(...keys)
}

describe('tpm reserve/reconcile', () => {
  beforeEach(clearBuckets)
  afterAll(clearBuckets)

  it('admits when under the cap', async () => {
    const r = await reserve(KEY_ID, 1000, 100)
    expect(r.estimate).toBe(100)
    expect(r.cap).toBe(1000)
  })

  it('rejects when reservation would exceed the cap', async () => {
    await reserve(KEY_ID, 1000, 800)
    // 800 + 300 = 1100 > 1000 → reject. Crucially, the rejected call must
    // NOT have incremented the bucket; otherwise a flood of failed
    // attempts would lock the limiter open.
    await expect(reserve(KEY_ID, 1000, 300)).rejects.toThrow(AppError)
    // Confirm the bucket is still at 800.
    const r = await reserve(KEY_ID, 1000, 200)
    expect(r.estimate).toBe(200)
  })

  it('reconcile decrements when actual < estimate', async () => {
    const r = await reserve(KEY_ID, 1000, 500)
    await reconcile(r, 200) // actual was less than we reserved
    // 500 reserved - 300 (delta) = 200 used. Another 800 should fit (200+800=1000).
    const r2 = await reserve(KEY_ID, 1000, 800)
    expect(r2.estimate).toBe(800)
  })

  it('reconcile increments when actual > estimate', async () => {
    const r = await reserve(KEY_ID, 1000, 100)
    await reconcile(r, 400) // we under-reserved by 300
    // 400 used. Another 700 fits, but 701 doesn't.
    await reserve(KEY_ID, 1000, 600)
    await expect(reserve(KEY_ID, 1000, 200)).rejects.toThrow(AppError)
  })

  it('release returns the full reservation', async () => {
    const r = await reserve(KEY_ID, 1000, 900)
    await release(r)
    // Whole bucket should be free again.
    const r2 = await reserve(KEY_ID, 1000, 1000)
    expect(r2.estimate).toBe(1000)
  })

  it('survives a parallel burst without admitting past the cap', async () => {
    // 10 concurrent reservations of 200 each against a cap of 1000. Exactly
    // 5 should succeed; the rest should reject. Without the Lua atomicity
    // we'd see all 10 read GET=0 and write INCRBY 200, blowing past the cap.
    const cap = 1000
    const each = 200
    const attempts = Array.from({ length: 10 }, () =>
      reserve(KEY_ID, cap, each).then(() => 'ok' as const).catch(() => 'rej' as const),
    )
    const outcomes = await Promise.all(attempts)
    const okCount = outcomes.filter((o) => o === 'ok').length
    expect(okCount).toBe(5)
  })
})
