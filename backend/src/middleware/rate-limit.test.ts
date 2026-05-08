import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { Hono } from 'hono'
import { rateLimit } from './rate-limit.js'
import { AppError, RateLimitError, toErrorBody } from '../shared/errors.js'
import { redis } from '../redis/client.js'

describe('rateLimit (token bucket)', () => {
  const prefix = `rl-tb-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  async function cleanup() {
    const keys = await redis.keys(`rl:tb:${prefix}*`)
    if (keys.length) await redis.del(...keys)
  }

  beforeEach(cleanup)
  afterAll(cleanup)

  function mkApp(limit: number, keyFn: () => string = () => `${prefix}:fixed`) {
    const app = new Hono()
    app.onError((err, c) => {
      if (err instanceof RateLimitError) {
        return c.json(
          { type: 'error', error: { type: 'rate_limit_error', message: err.message } },
          429,
          err.rateLimitHeaders,
        )
      }
      const status = err instanceof AppError ? err.status : 500
      return c.json(toErrorBody(err), status as any)
    })
    app.use('*', rateLimit(() => ({ key: keyFn(), limit })))
    app.get('/', (c) => c.json({ ok: true }))
    return app
  }

  it('allows requests up to limit, rejects beyond', async () => {
    const app = mkApp(3)
    for (let i = 0; i < 3; i++) {
      const r = await app.fetch(new Request('http://x/'))
      expect(r.status).toBe(200)
    }
    const r = await app.fetch(new Request('http://x/'))
    expect(r.status).toBe(429)
    const body = await r.json() as any
    expect(body.error.type).toBe('rate_limit_error')
  })

  it('returns Retry-After and X-RateLimit-* headers on 429', async () => {
    const app = mkApp(1)
    await app.fetch(new Request('http://x/'))  // consume the 1 token
    const r = await app.fetch(new Request('http://x/'))
    expect(r.status).toBe(429)
    expect(r.headers.get('retry-after')).not.toBeNull()
    expect(r.headers.get('x-ratelimit-limit-requests')).toBe('1')
    expect(r.headers.get('x-ratelimit-remaining-requests')).toBe('0')
    expect(r.headers.get('x-ratelimit-reset-requests')).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('counts per-key independently', async () => {
    let k = `${prefix}:a`
    const app = mkApp(1, () => k)
    const r1 = await app.fetch(new Request('http://x/'))
    expect(r1.status).toBe(200)
    const r2 = await app.fetch(new Request('http://x/'))
    expect(r2.status).toBe(429)
    k = `${prefix}:b`
    const r3 = await app.fetch(new Request('http://x/'))
    expect(r3.status).toBe(200)
  })
})
