// backend/src/tests/fixes.test.ts
//
// FT + flow-FT tests for the batch of fixes:
//   1. count-tokens RPM rate limiting
//   2. files endpoint RPM rate limiting
//   3. chargeUsd stored in request_logs
//   4. Sticky routing: same apiKey → same preferred upstream across requests

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { createApp } from '../app.js'
import { db, pool } from '../db/client.js'
import { users, apiKeys, upstreamKeys, models, requestLogs } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { setAnthropicBaseUrlOverride, env } from '../env.js'
import { newApiKey } from '../crypto/tokens.js'
import { hashPassword } from '../crypto/password.js'
import * as upstreamSvc from '../services/upstream-keys.js'
import { startMockUpstream } from './mock-upstream.js'
import { delCached } from '../services/api-key-cache.js'
import { hmacApiKey } from '../crypto/apikey-hmac.js'
import { redis } from '../redis/client.js'

const app = createApp()

let userId = ''
let skRelay = ''
let apiKeyId = ''

beforeAll(async () => {
  const [u] = await db.insert(users).values({
    email: `fixes-ft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    passwordHash: await hashPassword('secret123'),
    name: 'fixes-ft',
    balanceUsd: '50.000000',
  }).returning()
  userId = u!.id

  const { secret, prefix } = newApiKey()
  skRelay = secret
  const [k] = await db.insert(apiKeys).values({
    userId,
    name: 'fixes-ft',
    prefix,
    secretHash: await bcrypt.hash(secret, 12),
    state: 'active',
  }).returning()
  apiKeyId = k!.id

  await db.insert(models).values({
    id: 'fixes-test-model',
    displayName: 'Fixes Test',
    inputPriceUsdPerMtok: '3',
    outputPriceUsdPerMtok: '15',
    contextWindow: '200000',
    enabled: true,
    markupPct: '0.2',
  }).onConflictDoUpdate({
    target: models.id,
    set: {
      enabled: true,
      inputPriceUsdPerMtok: '3',
      outputPriceUsdPerMtok: '15',
      markupPct: '0.2',
    },
  })
})

afterAll(async () => {
  setAnthropicBaseUrlOverride(undefined)
  await db.delete(upstreamKeys)
  // pool is closed by e2e.test.ts (last file alphabetically)
})

beforeEach(async () => {
  await db.delete(upstreamKeys)
  // Clear all rate limit buckets for this apiKey so tests don't bleed into each other.
  await Promise.all([
    redis.del(`rl:tb:${apiKeyId}`),
    redis.del(`rl:tb:ct:${apiKeyId}`),
    redis.del(`rl:tb:files:${apiKeyId}`),
  ])
})

afterEach(async () => {
  await db.delete(upstreamKeys)
  setAnthropicBaseUrlOverride(undefined)
  // Restore defaults in case a test changed them.
  await db.update(apiKeys).set({ rpmLimit: null, tpmLimit: null }).where(eq(apiKeys.id, apiKeyId))
  await delCached(hmacApiKey(skRelay))
  await Promise.all([
    redis.del(`rl:tb:${apiKeyId}`),
    redis.del(`rl:tb:ct:${apiKeyId}`),
    redis.del(`rl:tb:files:${apiKeyId}`),
  ])
})

// ─────────────────────────────────────────────────────────────────────────────
// Helper: POST with our test API key
// ─────────────────────────────────────────────────────────────────────────────

function postMessages(body: any, extra: Record<string, string> = {}) {
  return app.fetch(new Request('http://x/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': skRelay,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      ...extra,
    },
    body: JSON.stringify(body),
  }))
}

function postCountTokens(body: any) {
  return app.fetch(new Request('http://x/v1/messages/count_tokens', {
    method: 'POST',
    headers: {
      'x-api-key': skRelay,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. count-tokens rate limiting
// ─────────────────────────────────────────────────────────────────────────────

describe('fixes: count-tokens rate limiting', () => {
  it.skipIf(env.DISABLE_USER_QUOTA)('returns 429 when RPM exceeded on count_tokens', async () => {
    const mock = await startMockUpstream([
      // count_tokens returns a simple JSON payload (no usage billing)
      { kind: 'ok', usage: { input: 10, output: 0 } },
    ])
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      await upstreamSvc.create({ alias: 'fixes-ct-up', secret: 'fixes-ct-up', priority: 100 })

      // Set RPM=1 so the second request is throttled
      await db.update(apiKeys).set({ rpmLimit: '1' }).where(eq(apiKeys.id, apiKeyId))
      await delCached(hmacApiKey(skRelay))
      await redis.del(`rl:tb:ct:${apiKeyId}`)

      const body = { model: 'fixes-test-model', messages: [{ role: 'user', content: 'count' }] }
      const r1 = await postCountTokens(body)
      expect(r1.status).toBe(200)

      const r2 = await postCountTokens(body)
      expect(r2.status).toBe(429)
      const err = await r2.json() as any
      expect(err.type).toBe('error')
    } finally {
      await db.update(apiKeys).set({ rpmLimit: null }).where(eq(apiKeys.id, apiKeyId))
      await delCached(hmacApiKey(skRelay))
      await redis.del(`rl:tb:ct:${apiKeyId}`)
      await mock.close()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. files endpoint rate limiting
// ─────────────────────────────────────────────────────────────────────────────

describe('fixes: files endpoint rate limiting', () => {
  it.skipIf(env.DISABLE_USER_QUOTA)('returns 429 when RPM exceeded on GET /v1/files', async () => {
    const mock = await startMockUpstream([
      // First file list → success
      { kind: 'ok', usage: { input: 0, output: 0 } },
    ])
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      await upstreamSvc.create({ alias: 'fixes-files-up', secret: 'fixes-files-up', priority: 100 })

      await db.update(apiKeys).set({ rpmLimit: '1' }).where(eq(apiKeys.id, apiKeyId))
      await delCached(hmacApiKey(skRelay))
      await redis.del(`rl:tb:files:${apiKeyId}`)

      const listFiles = () =>
        app.fetch(new Request('http://x/v1/files', {
          method: 'GET',
          headers: {
            'x-api-key': skRelay,
            'anthropic-version': '2023-06-01',
          },
        }))

      // First request passes (consumes the 1 RPM slot)
      const r1 = await listFiles()
      // mock returns 200-ish (or 404 — we don't care about the upstream response,
      // only that we got past the rate limiter)
      expect(r1.status).not.toBe(429)

      // Second request: rate limited
      const r2 = await listFiles()
      expect(r2.status).toBe(429)
    } finally {
      await db.update(apiKeys).set({ rpmLimit: null }).where(eq(apiKeys.id, apiKeyId))
      await delCached(hmacApiKey(skRelay))
      await redis.del(`rl:tb:files:${apiKeyId}`)
      await mock.close()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. chargeUsd stored in request_logs
// ─────────────────────────────────────────────────────────────────────────────

describe('fixes: chargeUsd in request_logs', () => {
  it('stores charge_usd (cost × markup) in the request log row', async () => {
    const mock = await startMockUpstream([
      { kind: 'ok', usage: { input: 100, output: 200 } },
    ])
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      await upstreamSvc.create({ alias: 'fixes-charge-up', secret: 'fixes-charge-up', priority: 100 })

      const r = await postMessages({
        model: 'fixes-test-model',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'charge test' }],
      })
      expect(r.status).toBe(200)

      const [log] = await db.select().from(requestLogs)
        .where(eq(requestLogs.userId, userId))
        .orderBy(desc(requestLogs.createdAt))
        .limit(1)
      expect(log).toBeDefined()

      // costUsd = (100 × 3 + 200 × 15) / 1e6 = 0.0033
      // chargeUsd = 0.0033 × 1.20 = 0.00396
      expect(Number(log!.costUsd)).toBeCloseTo(0.0033, 5)
      expect(Number(log!.chargeUsd)).toBeCloseTo(0.00396, 5)
      // chargeUsd must be strictly greater than costUsd (markup > 0)
      expect(Number(log!.chargeUsd)).toBeGreaterThan(Number(log!.costUsd))
    } finally {
      await mock.close()
    }
  })

  it('stores chargeUsd = 0 for failed requests (no tokens consumed)', async () => {
    const mock = await startMockUpstream([
      { kind: 'error', status: 500 },
      { kind: 'error', status: 500 },
      { kind: 'error', status: 500 },
      { kind: 'error', status: 500 },
    ])
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      await upstreamSvc.create({ alias: 'fixes-fail-up', secret: 'fixes-fail-up', priority: 100 })

      const r = await postMessages({
        model: 'fixes-test-model',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'should fail' }],
      })
      expect(r.status).toBe(502)

      const [log] = await db.select().from(requestLogs)
        .where(and(eq(requestLogs.userId, userId), eq(requestLogs.status, '502')))
        .orderBy(desc(requestLogs.createdAt))
        .limit(1)
      expect(log).toBeDefined()
      expect(Number(log!.chargeUsd)).toBe(0)
      expect(Number(log!.costUsd)).toBe(0)
    } finally {
      await mock.close()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Sticky routing: same apiKey → same preferred upstream
// ─────────────────────────────────────────────────────────────────────────────

describe('fixes: sticky routing (flow FT)', () => {
  it('with two upstreams, same apiKey hits the same one across sequential requests', async () => {
    // We create 2 mock behaviors for each key but track which one was called via
    // the mock's hit counter. Each upstream has a distinct mock server with its
    // own URL; sticky routing means both requests go to the same server.
    const mockA = await startMockUpstream([
      { kind: 'ok', usage: { input: 5, output: 5 } },
      { kind: 'ok', usage: { input: 5, output: 5 } },
    ])
    const mockB = await startMockUpstream([
      { kind: 'ok', usage: { input: 5, output: 5 } },
      { kind: 'ok', usage: { input: 5, output: 5 } },
    ])
    try {
      // Use a single mock base URL for both upstreams (they share the same mock
      // address). To test that the SAME upstream is chosen both times, we give
      // them very different weights so weightedShuffle would frequently choose
      // differently — but sticky routing should override that.
      //
      // Strategy: We can't inspect which upstream was chosen from the outside
      // (both use the same mock URL in e2e). Instead, we verify:
      //   a) requests succeed (upstream was reachable)
      //   b) upstreamKeyId in request_logs is the same for both requests
      setAnthropicBaseUrlOverride(mockA.baseUrl)

      const upA = await upstreamSvc.create({ alias: 'fixes-sticky-A', secret: 'fixes-sticky-A', priority: 100, weight: 100 })
      const upB = await upstreamSvc.create({ alias: 'fixes-sticky-B', secret: 'fixes-sticky-B', priority: 100, weight: 100 })

      const body = {
        model: 'fixes-test-model',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'sticky test' }],
      }

      const r1 = await postMessages(body)
      expect(r1.status).toBe(200)

      const r2 = await postMessages(body)
      expect(r2.status).toBe(200)

      // Wait a tick for commitRequest to complete
      await new Promise((r) => setTimeout(r, 150))

      const logs = await db.select().from(requestLogs)
        .where(and(eq(requestLogs.userId, userId), eq(requestLogs.status, '200')))
        .orderBy(desc(requestLogs.createdAt))
        .limit(2)

      expect(logs.length).toBe(2)
      const [log2, log1] = logs  // newest first

      // Both requests must have been routed to the same upstream key
      expect(log1!.upstreamKeyId).not.toBeNull()
      expect(log2!.upstreamKeyId).not.toBeNull()
      expect(log1!.upstreamKeyId).toBe(log2!.upstreamKeyId)

      // The chosen upstream must be one of the two we seeded
      expect([upA.id, upB.id]).toContain(log1!.upstreamKeyId)
    } finally {
      await mockA.close()
      await mockB.close()
    }
  })
})
