import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { Hono } from 'hono'
import { rateLimit } from './rate-limit.js'
import { AppError, toErrorBody } from '../shared/errors.js'
import { redis } from '../redis/client.js'

describe('rateLimit', () => {
  const prefix = `rl-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  beforeEach(async () => {
    const keys = await redis.keys(`${prefix}:*`)
    if (keys.length) await redis.del(...keys)
  })

  afterAll(async () => {
    try {
      const keys = await redis.keys(`${prefix}:*`)
      if (keys.length) await redis.del(...keys)
    } catch {}
  })

  function mkApp(limit: number, keyFn: () => string = () => `${prefix}:fixed`) {
    const app = new Hono()
    app.onError((err, c) => {
      const status = err instanceof AppError ? err.status : 500
      return c.json(toErrorBody(err), status as any)
    })
    app.use('*', rateLimit(() => ({ key: keyFn(), limit, windowSec: 60 })))
    app.get('/', (c) => c.json({ ok: true }))
    return app
  }

  it('allows up to limit, rejects beyond with rate_limit error', async () => {
    const app = mkApp(3)
    for (let i = 0; i < 3; i++) {
      const r = await app.fetch(new Request('http://x/'))
      expect(r.status).toBe(200)
    }
    const r = await app.fetch(new Request('http://x/'))
    expect(r.status).toBe(429)
    const body = await r.json() as any
    expect(body.error).toBe('rate_limit')
  })

  it('counts per-bucket-key independently', async () => {
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
