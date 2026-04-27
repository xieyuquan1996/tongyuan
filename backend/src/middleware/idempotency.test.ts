import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { Hono } from 'hono'
import { idempotency } from './idempotency.js'
import { redis } from '../redis/client.js'

describe('idempotency', () => {
  const prefix = `idem-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

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

  function mkApp() {
    const app = new Hono()
    let counter = 0
    app.use('*', idempotency((c) => {
      const h = c.req.header('idempotency-key')
      return h ? `${prefix}:${h}` : null
    }))
    app.post('/', (c) => {
      counter++
      return c.json({ n: counter })
    })
    return { app, getCounter: () => counter }
  }

  it('replays cached response on repeat key and sets x-idempotent-replay header', async () => {
    const { app, getCounter } = mkApp()
    const headers = { 'idempotency-key': 'k1', 'content-type': 'application/json' }

    const r1 = await app.fetch(new Request('http://x/', { method: 'POST', headers }))
    expect(r1.status).toBe(200)
    const b1 = await r1.json() as any
    expect(b1.n).toBe(1)
    expect(r1.headers.get('x-idempotent-replay')).toBeNull()

    const r2 = await app.fetch(new Request('http://x/', { method: 'POST', headers }))
    expect(r2.status).toBe(200)
    const b2 = await r2.json() as any
    expect(b2.n).toBe(1)
    expect(r2.headers.get('x-idempotent-replay')).toBe('true')
    expect(getCounter()).toBe(1)
  })

  it('passes through when no idempotency key is present', async () => {
    const { app, getCounter } = mkApp()
    const r1 = await app.fetch(new Request('http://x/', { method: 'POST' }))
    const r2 = await app.fetch(new Request('http://x/', { method: 'POST' }))
    expect((await r1.json() as any).n).toBe(1)
    expect((await r2.json() as any).n).toBe(2)
    expect(getCounter()).toBe(2)
  })

  it('different keys run handler independently', async () => {
    const { app, getCounter } = mkApp()
    const r1 = await app.fetch(new Request('http://x/', { method: 'POST', headers: { 'idempotency-key': 'a' } }))
    const r2 = await app.fetch(new Request('http://x/', { method: 'POST', headers: { 'idempotency-key': 'b' } }))
    expect((await r1.json() as any).n).toBe(1)
    expect((await r2.json() as any).n).toBe(2)
    expect(getCounter()).toBe(2)
  })

  it('skips when key function returns null', async () => {
    const app = new Hono()
    let n = 0
    app.use('*', idempotency(() => null))
    app.post('/', (c) => { n++; return c.json({ n }) })
    await app.fetch(new Request('http://x/', { method: 'POST', headers: { 'idempotency-key': 'skip-me' } }))
    await app.fetch(new Request('http://x/', { method: 'POST', headers: { 'idempotency-key': 'skip-me' } }))
    expect(n).toBe(2)
  })

  it('handler-throws → sentinel cleared, retry runs again', async () => {
    const app = new Hono()
    let n = 0
    app.use('*', idempotency((c) => {
      const h = c.req.header('idempotency-key')
      return h ? `${prefix}:${h}` : null
    }))
    app.onError((_err, c) => c.json({ error: 'boom' }, 500))
    app.post('/', () => { n++; throw new Error('boom') })

    const r1 = await app.fetch(new Request('http://x/', {
      method: 'POST', headers: { 'idempotency-key': 'throw-key' },
    }))
    expect(r1.status).toBe(500)
    // Key should NOT remain in redis after a throw
    const stored = await redis.get(`${prefix}:throw-key`)
    expect(stored).toBeNull()

    const r2 = await app.fetch(new Request('http://x/', {
      method: 'POST', headers: { 'idempotency-key': 'throw-key' },
    }))
    expect(r2.status).toBe(500)
    expect(n).toBe(2)  // handler ran both times
  })

  it('handler returns 5xx → not cached, retry runs again', async () => {
    const app = new Hono()
    let n = 0
    app.use('*', idempotency((c) => {
      const h = c.req.header('idempotency-key')
      return h ? `${prefix}:${h}` : null
    }))
    app.post('/', (c) => { n++; return c.json({ err: 1 }, 500) })

    const r1 = await app.fetch(new Request('http://x/', {
      method: 'POST', headers: { 'idempotency-key': '5xx-key' },
    }))
    expect(r1.status).toBe(500)

    const r2 = await app.fetch(new Request('http://x/', {
      method: 'POST', headers: { 'idempotency-key': '5xx-key' },
    }))
    expect(r2.status).toBe(500)
    expect(r2.headers.get('x-idempotent-replay')).toBeNull()
    expect(n).toBe(2)
  })

  it('handler returns 4xx → CACHED, retry replays', async () => {
    const app = new Hono()
    let n = 0
    app.use('*', idempotency((c) => {
      const h = c.req.header('idempotency-key')
      return h ? `${prefix}:${h}` : null
    }))
    app.post('/', (c) => { n++; return c.json({ error: 'bad' }, 400) })

    const r1 = await app.fetch(new Request('http://x/', {
      method: 'POST', headers: { 'idempotency-key': '4xx-key' },
    }))
    expect(r1.status).toBe(400)
    expect(r1.headers.get('x-idempotent-replay')).toBeNull()

    const r2 = await app.fetch(new Request('http://x/', {
      method: 'POST', headers: { 'idempotency-key': '4xx-key' },
    }))
    expect(r2.status).toBe(400)
    expect(r2.headers.get('x-idempotent-replay')).toBe('true')
    expect(n).toBe(1)  // replayed, handler did not run twice
  })
})
