import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { redis } from '../redis/client.js'
import * as quota from './quota.js'
import { DEFAULT_BUDGETS } from './family.js'

// These tests hit the real Redis instance configured via REDIS_URL. The quota
// module uses EVAL for atomicity, so there's no meaningful unit test without
// Redis — we'd just be testing a mock.

const TEST_PREFIX = 'test-quota-'

async function cleanup(upstreamId: string) {
  const keys = await redis.keys(`q:${upstreamId}:*`)
  if (keys.length) await redis.del(...keys)
  const cdKeys = await redis.keys(`q:cd:${upstreamId}:*`)
  if (cdKeys.length) await redis.del(...cdKeys)
}

describe('quota.reserve', () => {
  const id = TEST_PREFIX + 'reserve'
  beforeEach(() => cleanup(id))
  afterAll(() => cleanup(id))

  it('allows a reservation that fits', async () => {
    const r = await quota.reserve(id, 'opus', DEFAULT_BUDGETS.opus, 100, 100)
    expect(r.ok).toBe(true)
  })

  it('rejects when RPM exceeded', async () => {
    const tiny = { rpm: 2, itpmExclCache: 1_000_000, otpm: 1_000_000 }
    expect((await quota.reserve(id, 'opus', tiny, 1, 1)).ok).toBe(true)
    expect((await quota.reserve(id, 'opus', tiny, 1, 1)).ok).toBe(true)
    const r = await quota.reserve(id, 'opus', tiny, 1, 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('rpm')
  })

  it('rejects when ITPM would be exceeded', async () => {
    const tiny = { rpm: 100, itpmExclCache: 1_000, otpm: 100_000 }
    expect((await quota.reserve(id, 'opus', tiny, 800, 1)).ok).toBe(true)
    const r = await quota.reserve(id, 'opus', tiny, 300, 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('itpm')
  })

  it('isolates families on the same key', async () => {
    // Saturate opus; sonnet on the same key must still succeed.
    const tiny = { rpm: 1, itpmExclCache: 10, otpm: 10 }
    await quota.reserve(id, 'opus', tiny, 5, 5)
    const opusSecond = await quota.reserve(id, 'opus', tiny, 1, 1)
    expect(opusSecond.ok).toBe(false)
    const sonnet = await quota.reserve(id, 'sonnet', tiny, 5, 5)
    expect(sonnet.ok).toBe(true)
  })
})

describe('quota.commit reconciliation', () => {
  const id = TEST_PREFIX + 'reconcile'
  beforeEach(() => cleanup(id))
  afterAll(() => cleanup(id))

  it('refunds overestimated tokens so later requests can fit', async () => {
    const budget = { rpm: 100, itpmExclCache: 1_000, otpm: 1_000 }
    // Reserve 800, consume only 100. Another 800 should now fit.
    const r = await quota.reserve(id, 'opus', budget, 800, 0)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    await quota.commit(id, 'opus', r.bucket, r.estIn, r.estOut, 100, 0)
    const second = await quota.reserve(id, 'opus', budget, 800, 0)
    expect(second.ok).toBe(true)
  })

  it('charges back the overage when real usage exceeds estimate', async () => {
    const budget = { rpm: 100, itpmExclCache: 1_000, otpm: 1_000 }
    const r = await quota.reserve(id, 'opus', budget, 100, 0)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Real usage was 500, not 100. Next reservation should see 500 in use.
    await quota.commit(id, 'opus', r.bucket, r.estIn, r.estOut, 500, 0)
    const snap = await quota.snapshotFamily(id, 'opus')
    expect(snap.inTok).toBe(500)
  })
})

describe('quota.release', () => {
  const id = TEST_PREFIX + 'release'
  beforeEach(() => cleanup(id))
  afterAll(() => cleanup(id))

  it('frees up the reservation after a failed request', async () => {
    const budget = { rpm: 2, itpmExclCache: 10, otpm: 10 }
    const r = await quota.reserve(id, 'opus', budget, 5, 5)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    await quota.release(id, 'opus', r.bucket, r.estIn, r.estOut)
    // After release, a new reservation for the same shape fits again.
    const second = await quota.reserve(id, 'opus', budget, 5, 5)
    expect(second.ok).toBe(true)
  })
})

describe('quota.markFamilyCooldown', () => {
  const id = TEST_PREFIX + 'cooldown'
  beforeEach(() => cleanup(id))
  afterAll(() => cleanup(id))

  it('blocks reservations until cooldown expires', async () => {
    await quota.markFamilyCooldown(id, 'opus', Date.now() + 60_000, 'http_429')
    const r = await quota.reserve(id, 'opus', DEFAULT_BUDGETS.opus, 10, 10)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('cooldown')
  })

  it('does not block other families on the same key', async () => {
    await quota.markFamilyCooldown(id, 'opus', Date.now() + 60_000, 'http_429')
    const r = await quota.reserve(id, 'sonnet', DEFAULT_BUDGETS.sonnet, 10, 10)
    expect(r.ok).toBe(true)
  })
})
