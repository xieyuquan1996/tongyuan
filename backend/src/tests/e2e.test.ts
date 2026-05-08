// backend/src/tests/e2e.test.ts
//
// End-to-end tests for the full pipeline:
//   client → Hono app → gateway → mock Anthropic upstream → billing
// Uses a self-contained node:http mock (no external services, no msw).

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { createApp } from '../app.js'
import { db, pool } from '../db/client.js'
import { users, apiKeys, upstreamKeys, models, requestLogs } from '../db/schema.js'
import { and, eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { setAnthropicBaseUrlOverride, env } from '../env.js'
import { newApiKey } from '../crypto/tokens.js'
import { hashPassword } from '../crypto/password.js'
import * as upstreamSvc from '../services/upstream-keys.js'
import * as quota from '../gateway/quota.js'
import { startMockUpstream } from './mock-upstream.js'
import { delCached } from '../services/api-key-cache.js'
import { hmacApiKey } from '../crypto/apikey-hmac.js'
import { redis } from '../redis/client.js'

const app = createApp()

let userId = ''
let skRelay = ''

beforeAll(async () => {
  // Seed a user + api key directly (bypass HTTP for setup speed).
  const [u] = await db.insert(users).values({
    email: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    passwordHash: await hashPassword('secret123'),
    name: 'e2e',
    balanceUsd: '10.000000',
  }).returning()
  userId = u!.id

  const { secret, prefix } = newApiKey()
  skRelay = secret
  await db.insert(apiKeys).values({
    userId,
    name: 'e2e',
    prefix,
    secretHash: await bcrypt.hash(secret, 12),
    state: 'active',
  })

  await db.insert(models).values({
    id: 'e2e-test-model',
    displayName: 'E2E Test',
    inputPriceUsdPerMtok: '3',
    outputPriceUsdPerMtok: '15',
    contextWindow: '200000',
    enabled: true,
  }).onConflictDoUpdate({
    target: models.id,
    set: { enabled: true, inputPriceUsdPerMtok: '3', outputPriceUsdPerMtok: '15' },
  })
})

afterAll(async () => {
  setAnthropicBaseUrlOverride(undefined)
  // Don't leave upstream rows behind for parallel test files that assume an
  // empty pool (messages.failover, playground.all-upstreams-down).
  await db.delete(upstreamKeys)
  await pool.end()
})

beforeEach(async () => {
  // Each test owns its own upstream pool.
  await db.delete(upstreamKeys)
})

afterEach(async () => {
  // Release the pool back to empty so parallel test files don't see our rows.
  await db.delete(upstreamKeys)
  setAnthropicBaseUrlOverride(undefined)
})

async function seedUpstream(secret = 'e2e-upstream-secret', priority = 100) {
  return upstreamSvc.create({ alias: `e2e-${priority}`, secret, priority })
}

async function post(path: string, body: any, headers: Record<string, string> = {}) {
  return app.fetch(new Request('http://x' + path, {
    method: 'POST',
    headers: {
      'x-api-key': skRelay,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  }))
}

describe('e2e: POST /v1/messages happy path', () => {
  it('round-trips request → upstream → billing', async () => {
    const mock = await startMockUpstream([
      { kind: 'ok', usage: { input: 100, output: 200 } },
    ])
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      await seedUpstream('e2e-happy-secret', 100)

      const r = await post('/v1/messages', {
        model: 'e2e-test-model',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'ping' }],
      })
      expect(r.status).toBe(200)
      const body = await r.json() as any
      expect(body.content[0].text).toBe('pong')
      expect(mock.hits).toBe(1)

      const logs = await db.select().from(requestLogs).where(eq(requestLogs.userId, userId))
      expect(logs.length).toBeGreaterThan(0)
      const latest = logs[logs.length - 1]!
      expect(Number(latest.status)).toBe(200)
      expect(latest.auditMatch).toBe(true)
      expect(Number(latest.inputTokens)).toBe(100)
      expect(Number(latest.outputTokens)).toBe(200)
      // (100 * 3 + 200 * 15) / 1e6 = 0.0033
      expect(Number(latest.costUsd)).toBeCloseTo(0.0033, 6)

      const [u] = await db.select().from(users).where(eq(users.id, userId))
      expect(Number(u!.balanceUsd)).toBeLessThan(10)
    } finally {
      await mock.close()
      setAnthropicBaseUrlOverride(undefined)
    }
  })
})

describe('e2e: failover', () => {
  it('first upstream 429, second 200, request succeeds and first is cooled down per-family', async () => {
    const mock = await startMockUpstream([
      { kind: 'error', status: 429, body: '{"error":"rate_limit"}' },
      { kind: 'ok', usage: { input: 10, output: 20 } },
    ])
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      const a = await seedUpstream('e2e-failover-A', 100)
      const b = await seedUpstream('e2e-failover-B', 200)

      const r = await post('/v1/messages', {
        model: 'e2e-test-model',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'retry' }],
      })
      expect(r.status).toBe(200)
      expect(mock.hits).toBe(2)

      // 429 now marks a per-family (not whole-key) cooldown in Redis — other
      // families on the same key should still be usable. Model id
      // 'e2e-test-model' lacks 'opus'/'haiku' so falls under the sonnet family.
      const cooled = await quota.isFamilyCoolingDown(a.id, 'sonnet')
      expect(cooled).not.toBeNull()
      const stillHot = await quota.isFamilyCoolingDown(b.id, 'sonnet')
      expect(stillHot).toBeNull()
    } finally {
      await mock.close()
      setAnthropicBaseUrlOverride(undefined)
    }
  })
})

describe('e2e: all upstreams down', () => {
  it('returns 502 and writes a failure log', async () => {
    const mock = await startMockUpstream([
      { kind: 'error', status: 500 },
      { kind: 'error', status: 500 },
      { kind: 'error', status: 500 },
    ])
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      await seedUpstream('e2e-down-1', 100)
      await seedUpstream('e2e-down-2', 200)
      await seedUpstream('e2e-down-3', 300)

      const r = await post('/v1/messages', {
        model: 'e2e-test-model',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'fail' }],
      })
      expect(r.status).toBe(502)

      const logs = await db.select().from(requestLogs)
        .where(and(eq(requestLogs.userId, userId), eq(requestLogs.status, '502')))
      expect(logs.length).toBeGreaterThan(0)
      expect(logs[logs.length - 1]!.errorCode).toBe('all_upstreams_down')
    } finally {
      await mock.close()
      setAnthropicBaseUrlOverride(undefined)
    }
  })
})

describe('rate limiting', () => {
  it.skipIf(env.DISABLE_USER_QUOTA)('returns 429 with Retry-After and rate limit headers when RPM exceeded', async () => {
    // Look up the API key row first so we can reference its id in cleanup.
    const [keyRow] = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId))
    if (!keyRow) throw new Error('API key row not found in rate-limit test setup')
    const keyId = keyRow.id

    const mock = await startMockUpstream([
      { kind: 'ok', usage: { input: 10, output: 5 } },
      { kind: 'ok', usage: { input: 10, output: 5 } },
    ])
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      await seedUpstream()

      // Set a low rpm_limit so we can exhaust it in one request.
      // Invalidate the Redis API-key cache so the new rpmLimit is picked up
      // immediately (cache TTL is 5 min; without this, previous tests would
      // leave a stale entry with the default 60 RPM limit).
      // Also delete the token-bucket key so this test always starts with a
      // clean bucket regardless of how many requests earlier tests made.
      await db.update(apiKeys).set({ rpmLimit: '1' }).where(eq(apiKeys.userId, userId))
      await delCached(hmacApiKey(skRelay))
      await redis.del(`rl:tb:${keyId}`)

      const makeRequest = () =>
        post('/v1/messages', {
          model: 'e2e-test-model',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 10,
        })

      // First request: should succeed (consumes the 1 RPM token)
      const r1 = await makeRequest()
      expect(r1.status).toBe(200)

      // Second request: RPM exceeded
      const r2 = await makeRequest()
      expect(r2.status).toBe(429)
      expect(r2.headers.get('retry-after')).not.toBeNull()
      expect(r2.headers.get('x-ratelimit-limit-requests')).toBe('1')
      expect(r2.headers.get('x-ratelimit-remaining-requests')).toBe('0')
      expect(r2.headers.get('x-ratelimit-reset-requests')).toMatch(/^\d{4}-\d{2}-\d{2}T/)

      const body = await r2.json() as any
      expect(body.type).toBe('error')
      expect(body.error.type).toBe('rate_limit_error')
      expect(body.error.message).toMatch(/RPM/)
    } finally {
      // Reset rpm_limit, flush the API-key cache, and delete the Redis
      // token-bucket so later tests see a clean rate-limit state (the drained
      // bucket would otherwise throttle the very next request in the streaming
      // test, since a 1-RPM bucket needs 60 s to refill from 0).
      await db.update(apiKeys).set({ rpmLimit: null }).where(eq(apiKeys.userId, userId))
      await delCached(hmacApiKey(skRelay))
      await redis.del(`rl:tb:${keyId}`)
      await mock.close()
      setAnthropicBaseUrlOverride(undefined)
    }
  })
})

describe('e2e: streaming', () => {
  it('SSE frames pass through, usage commits after stream ends', async () => {
    const mock = await startMockUpstream([{ kind: 'stream', chunks: 3 }])
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      await seedUpstream('e2e-stream-secret', 100)

      const r = await post('/v1/messages', {
        model: 'e2e-test-model',
        max_tokens: 64,
        stream: true,
        messages: [{ role: 'user', content: 'stream please' }],
      })
      expect(r.status).toBe(200)
      const text = await r.text()
      expect(text).toContain('event: message_start')
      expect(text).toContain('event: message_stop')
      expect((text.match(/event: content_block_delta/g) ?? []).length).toBe(3)

      // commitRequest runs inside hono/streaming's finally block; give it a
      // tick to flush before we query the db.
      await new Promise((resolve) => setTimeout(resolve, 100))

      const logs = await db.select().from(requestLogs)
        .where(and(eq(requestLogs.userId, userId), eq(requestLogs.stream, true)))
      expect(logs.length).toBeGreaterThan(0)
      const latest = logs[logs.length - 1]!
      expect(Number(latest.status)).toBe(200)
      // message_start.usage.input_tokens = 10, message_delta.usage.output_tokens = 3*3 = 9
      expect(Number(latest.inputTokens)).toBe(10)
      expect(Number(latest.outputTokens)).toBe(9)
    } finally {
      await mock.close()
      setAnthropicBaseUrlOverride(undefined)
    }
  })
})
