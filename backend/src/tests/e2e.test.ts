// backend/src/tests/e2e.test.ts
//
// End-to-end tests for the full pipeline:
//   client → Hono app → gateway → mock Anthropic upstream → billing
// Uses a self-contained node:http mock (no external services, no msw).

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
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
import * as biller from '../gateway/biller.js'
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
      // Give A an overwhelming weight (9999:1) so weightedShuffle deterministically
      // picks A first. Without explicit weights, both default to 100 and the 50/50
      // shuffle makes the test order-dependent and flaky.
      const a = await upstreamSvc.create({ alias: 'e2e-failover-A', secret: 'e2e-failover-A', priority: 100, weight: 9999 })
      const b = await upstreamSvc.create({ alias: 'e2e-failover-B', secret: 'e2e-failover-B', priority: 200, weight: 1 })

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
  // Helper: get the API key row for the test user (shared across rate-limit tests).
  async function getKeyId(): Promise<string> {
    const [keyRow] = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId))
    if (!keyRow) throw new Error('API key row not found in rate-limit test setup')
    return keyRow.id
  }

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

  it.skipIf(env.DISABLE_USER_QUOTA)('returns 429 with token headers when TPM exhausted on /v1/messages', async () => {
    // estimateInputTokens({ messages: [{role:'user',content:'hi'}], max_tokens:10 })
    //   = ceil((17 chars / 4) * 1.1) = 5
    // estimateOutputTokens(..., cap=50) = min(10, 50) = 10
    // Total estimate per request = 15. Mock actual = input(10)+output(5) = 15.
    // delta = 0 on each reconcile → net cost = 15 tokens/request.
    // After 3 requests: 50 - 45 = 5 remaining. 4th estimate(15) > 5 → 429.
    const keyId = await getKeyId()
    const mock = await startMockUpstream([
      { kind: 'ok', usage: { input: 10, output: 5 } },
      { kind: 'ok', usage: { input: 10, output: 5 } },
      { kind: 'ok', usage: { input: 10, output: 5 } },
    ])
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      await seedUpstream()

      await db.update(apiKeys).set({ tpmLimit: '50' }).where(eq(apiKeys.userId, userId))
      await delCached(hmacApiKey(skRelay))
      await redis.del(`rl:tpm:${keyId}`)

      const makeRequest = () =>
        post('/v1/messages', {
          model: 'e2e-test-model',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 10,
        })

      expect((await makeRequest()).status).toBe(200)
      expect((await makeRequest()).status).toBe(200)
      expect((await makeRequest()).status).toBe(200)

      // 4th request: TPM exhausted
      const r4 = await makeRequest()
      expect(r4.status).toBe(429)
      expect(r4.headers.get('retry-after')).not.toBeNull()
      expect(r4.headers.get('x-ratelimit-limit-tokens')).toBe('50')
      expect(r4.headers.get('x-ratelimit-remaining-tokens')).toMatch(/^\d+$/)
      expect(r4.headers.get('x-ratelimit-reset-tokens')).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      // RPM headers must NOT appear on a TPM-triggered 429
      expect(r4.headers.get('x-ratelimit-limit-requests')).toBeNull()

      const body = await r4.json() as any
      expect(body.type).toBe('error')
      expect(body.error.type).toBe('rate_limit_error')
      expect(body.error.message).toMatch(/TPM/)
    } finally {
      await db.update(apiKeys).set({ tpmLimit: null }).where(eq(apiKeys.userId, userId))
      await delCached(hmacApiKey(skRelay))
      await redis.del(`rl:tpm:${keyId}`)
      await mock.close()
      setAnthropicBaseUrlOverride(undefined)
    }
  })

  it.skipIf(env.DISABLE_USER_QUOTA)('returns 429 with rate limit headers on /v1/chat/completions when RPM exceeded', async () => {
    const keyId = await getKeyId()
    const mock = await startMockUpstream([
      { kind: 'ok', usage: { input: 10, output: 5 } },
    ])
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      await seedUpstream()

      await db.update(apiKeys).set({ rpmLimit: '1' }).where(eq(apiKeys.userId, userId))
      await delCached(hmacApiKey(skRelay))
      await redis.del(`rl:tb:${keyId}`)

      const makeRequest = () =>
        app.fetch(new Request('http://x/v1/chat/completions', {
          method: 'POST',
          headers: {
            'x-api-key': skRelay,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'e2e-test-model',
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 10,
          }),
        }))

      // First request: passes, response is in OpenAI format
      const r1 = await makeRequest()
      expect(r1.status).toBe(200)
      const body1 = await r1.json() as any
      expect(body1.choices).toBeDefined()

      // Second request: RPM exceeded — 429 with standard rate-limit headers
      const r2 = await makeRequest()
      expect(r2.status).toBe(429)
      expect(r2.headers.get('retry-after')).not.toBeNull()
      expect(r2.headers.get('x-ratelimit-limit-requests')).toBe('1')
      expect(r2.headers.get('x-ratelimit-remaining-requests')).toBe('0')
      expect(r2.headers.get('x-ratelimit-reset-requests')).toMatch(/^\d{4}-\d{2}-\d{2}T/)

      const body2 = await r2.json() as any
      expect(body2.type).toBe('error')
      expect(body2.error.type).toBe('rate_limit_error')
      expect(body2.error.message).toMatch(/RPM/)
    } finally {
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

describe('e2e: balance hold', () => {
  // 每个测试用独立的用户和密钥，避免相互干扰
  async function seedUser(balanceUsd: string): Promise<{ userId: string; secret: string }> {
    const [u] = await db.insert(users).values({
      email: `hold-ft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      passwordHash: await hashPassword('secret123'),
      name: 'hold-ft',
      balanceUsd,
    }).returning()
    const { secret, prefix } = newApiKey()
    await db.insert(apiKeys).values({
      userId: u!.id,
      name: 'hold-ft',
      prefix,
      secretHash: await bcrypt.hash(secret, 12),
      state: 'active',
    })
    return { userId: u!.id, secret }
  }

  async function postAs(secret: string, body: any): Promise<Response> {
    return app.fetch(new Request('http://x/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': secret,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }))
  }

  // F1: 并发两请求，余额只够一个 hold → 一个 200，一个 402，balance ≥ 0
  it('F1: concurrent requests — only one passes admission when balance only fits one hold', async () => {
    // hold for {model, max_tokens:64, messages:[{role:'user',content:'ping'}]}
    //   estimateInputTokens ≈ 6 tokens, output = 64
    //   hold = (6*3 + 64*15) / 1e6 = 0.000978
    // balance 0.0015 → 单次扣得动（剩 0.000522），两次扣不动（0.001956 > 0.0015）
    const { userId: u, secret } = await seedUser('0.001500')
    const mock = await startMockUpstream([
      { kind: 'ok', usage: { input: 10, output: 20 } },   // 实际成本 ~0.00033，小于 hold
    ])
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      await seedUpstream('hold-f1-secret', 100)

      const req = () => postAs(secret, {
        model: 'e2e-test-model',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'ping' }],
      })

      const [r1, r2] = await Promise.all([req(), req()])
      const statuses = [r1.status, r2.status].sort()
      expect(statuses).toEqual([200, 402])

      // 失败那个的响应体应该是 insufficient_balance
      const failed = r1.status === 402 ? r1 : r2
      const body = await failed.json() as any
      expect(body.error).toBe('insufficient_balance')

      // 最终余额必须 ≥ 0（验证不会变负）
      const [after] = await db.select().from(users).where(eq(users.id, u))
      expect(Number(after!.balanceUsd)).toBeGreaterThanOrEqual(0)
      // 上游只被命中 1 次（被拒的请求不该转发上游）
      expect(mock.hits).toBe(1)
    } finally {
      await mock.close()
      setAnthropicBaseUrlOverride(undefined)
      await db.delete(users).where(eq(users.id, u))
    }
  })

  // F2: 余额为 0 时发起请求 → 402 insufficient_balance（中间件预检）
  it('F2: zero balance returns 402 immediately at middleware', async () => {
    const { userId: u, secret } = await seedUser('0.000000')
    const mock = await startMockUpstream([])   // 不该被调用
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      await seedUpstream('hold-f2-secret', 100)

      const r = await postAs(secret, {
        model: 'e2e-test-model',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'ping' }],
      })
      expect(r.status).toBe(402)
      const body = await r.json() as any
      expect(body.error).toBe('insufficient_balance')

      const [after] = await db.select().from(users).where(eq(users.id, u))
      expect(after!.balanceUsd).toBe('0.000000')
      expect(mock.hits).toBe(0)
    } finally {
      await mock.close()
      setAnthropicBaseUrlOverride(undefined)
      await db.delete(users).where(eq(users.id, u))
    }
  })

  // F4: commitRequest 在成功路径中抛异常 → handleNonStream 外层 finally 退还 hold
  it('F4: refunds hold when commitRequest throws on success path (non-stream)', async () => {
    const { userId: u, secret } = await seedUser('0.001500')
    const before = '0.001500'
    const mock = await startMockUpstream([
      { kind: 'ok', usage: { input: 10, output: 20 } },
    ])
    // 让 commitRequest 第一次调用就抛异常，模拟 DB 故障等场景
    const spy = vi.spyOn(biller, 'commitRequest').mockRejectedValueOnce(new Error('forced commit failure'))
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      await seedUpstream('hold-f4-secret', 100)

      const r = await postAs(secret, {
        model: 'e2e-test-model',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'ping' }],
      })
      // commitRequest 抛了未捕获异常，应该返回 5xx
      expect(r.status).toBeGreaterThanOrEqual(500)

      // hold 应被外层 finally 退还
      const [after] = await db.select().from(users).where(eq(users.id, u))
      expect(Number(after!.balanceUsd)).toBeCloseTo(Number(before), 6)
    } finally {
      spy.mockRestore()
      await mock.close()
      setAnthropicBaseUrlOverride(undefined)
      await db.delete(users).where(eq(users.id, u))
    }
  })

  // F3: upstream 全错误 → hold 被退还，balance 不被扣费
  it('F3: upstream failure path refunds the hold', async () => {
    const { userId: u, secret } = await seedUser('0.001500')
    const before = '0.001500'
    const mock = await startMockUpstream([
      { kind: 'error', status: 500 },
      { kind: 'error', status: 500 },
      { kind: 'error', status: 500 },
    ])
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      await seedUpstream('hold-f3-secret', 100)

      const r = await postAs(secret, {
        model: 'e2e-test-model',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'ping' }],
      })
      expect(r.status).toBe(502)

      const [after] = await db.select().from(users).where(eq(users.id, u))
      // hold 应被全额退还，余额回到初始值
      expect(Number(after!.balanceUsd)).toBeCloseTo(Number(before), 6)
    } finally {
      await mock.close()
      setAnthropicBaseUrlOverride(undefined)
      await db.delete(users).where(eq(users.id, u))
    }
  })

  // F5: handleStream 流内 commitRequest 抛异常 → 内层 finally 退还 hold
  it('F5: refunds hold when commitRequest throws inside stream finally', async () => {
    const { userId: u, secret } = await seedUser('0.001500')
    const before = '0.001500'
    const mock = await startMockUpstream([{ kind: 'stream', chunks: 2 }])
    const spy = vi.spyOn(biller, 'commitRequest').mockRejectedValueOnce(new Error('forced commit failure in stream'))
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      await seedUpstream('hold-f5-secret', 100)

      const r = await postAs(secret, {
        model: 'e2e-test-model',
        max_tokens: 64,
        stream: true,
        messages: [{ role: 'user', content: 'stream' }],
      })
      // stream 已经开始返回，状态码是 200；commitRequest 在 stream 结束后才抛
      expect(r.status).toBe(200)
      await r.text()   // 消费完 stream 让 finally 跑完

      // 给 finally 里的 refundHold 一个 tick 完成
      await new Promise((resolve) => setTimeout(resolve, 100))

      const [after] = await db.select().from(users).where(eq(users.id, u))
      expect(Number(after!.balanceUsd)).toBeCloseTo(Number(before), 6)
    } finally {
      spy.mockRestore()
      await mock.close()
      setAnthropicBaseUrlOverride(undefined)
      await db.delete(users).where(eq(users.id, u))
    }
  })

  // F7: 高并发压力 — N=20 个同用户请求，余额无法全部覆盖，验证守恒和无负余额
  it('F7: stress test — N=20 concurrent, money conserved, balance never goes negative', async () => {
    const N = 20
    // 初始 0.00330 USD：
    //   hold per req ≈ 0.000978，actual per req = (10*3 + 20*15)/1e6 = 0.00033
    //   max ok = floor(0.00330 / 0.000978) = 3 个并行 hold 能扣到；
    //   随着 commit 退还差额（hold - actual = 0.000648），更多 hold 可能挤入。
    //   实测 ok ∈ [3, 10] 区间，确定有 ≥ 10 个会被拦截。
    const initial = '0.003300'
    const actualPerRequest = (10 * 3 + 20 * 15) / 1_000_000  // 0.00033

    const { userId: u, secret } = await seedUser(initial)
    const mock = await startMockUpstream(
      Array.from({ length: N }, () => ({ kind: 'ok' as const, usage: { input: 10, output: 20 } })),
    )
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      await seedUpstream('hold-f7-secret', 100)

      const req = () => postAs(secret, {
        model: 'e2e-test-model',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'ping' }],
      })

      const results = await Promise.all(Array.from({ length: N }, req))
      const ok = results.filter((r) => r.status === 200).length
      const blocked = results.filter((r) => r.status === 402).length

      // 不变量 1：每个请求要么 200 要么 402，不允许 5xx
      expect(ok + blocked).toBe(N)

      // 不变量 2：必然有部分被拦截（余额不足以覆盖全部 N 个 hold）
      expect(blocked).toBeGreaterThan(0)

      // 不变量 3：只有成功 hold 的请求才到上游
      expect(mock.hits).toBe(ok)

      // 不变量 4：余额绝不变负（hold 机制核心保证）
      const [after] = await db.select().from(users).where(eq(users.id, u))
      expect(Number(after!.balanceUsd)).toBeGreaterThanOrEqual(0)

      // 不变量 5：货币守恒 final = initial - ok × actual_per_request
      expect(Number(after!.balanceUsd)).toBeCloseTo(
        Number(initial) - ok * actualPerRequest,
        4,
      )
    } finally {
      await mock.close()
      setAnthropicBaseUrlOverride(undefined)
      await db.delete(users).where(eq(users.id, u))
    }
  })

  // F6: handleStream 进入 stream 前的失败路径里 commitRequest 抛异常 → 外层 finally 退还 hold
  it('F6: refunds hold when pre-stream commitRequest throws', async () => {
    const { userId: u, secret } = await seedUser('0.001500')
    const before = '0.001500'
    // upstream 全失败，会走 if (!response) 分支
    const mock = await startMockUpstream([
      { kind: 'error', status: 500 },
      { kind: 'error', status: 500 },
      { kind: 'error', status: 500 },
    ])
    const spy = vi.spyOn(biller, 'commitRequest').mockRejectedValueOnce(new Error('forced pre-stream commit failure'))
    try {
      setAnthropicBaseUrlOverride(mock.baseUrl)
      await seedUpstream('hold-f6-secret', 100)

      const r = await postAs(secret, {
        model: 'e2e-test-model',
        max_tokens: 64,
        stream: true,
        messages: [{ role: 'user', content: 'stream' }],
      })
      expect(r.status).toBeGreaterThanOrEqual(500)

      const [after] = await db.select().from(users).where(eq(users.id, u))
      // pre-stream 失败路径里 commitRequest 抛了，外层 finally 退还 hold
      expect(Number(after!.balanceUsd)).toBeCloseTo(Number(before), 6)
    } finally {
      spy.mockRestore()
      await mock.close()
      setAnthropicBaseUrlOverride(undefined)
      await db.delete(users).where(eq(users.id, u))
    }
  })
})
