import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest'
import { createApp } from '../../app.js'
import { pool, db } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

const app = createApp()
let token = ''
let userId = ''

beforeAll(async () => {
  const email = `webhook-test-ep-${Date.now()}@example.com`
  await pool.query(`DELETE FROM users WHERE email LIKE 'webhook-test-ep-%'`)
  const r = await app.fetch(new Request('http://x/api/console/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123456', name: 'W' }),
  }))
  const j = await r.json()
  token = j.session.token
  userId = j.user.id
})

afterAll(async () => { await pool.end() })
afterEach(() => { vi.restoreAllMocks() })

async function post(init: RequestInit = {}) {
  return app.fetch(new Request('http://x/api/console/webhooks/test', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...init,
  }))
}

describe('POST /api/console/webhooks/test', () => {
  it('returns 400 when no webhook URL configured', async () => {
    const r = await post()
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('no_webhook_url')
  })

  it('returns ok=true when delivery succeeds', async () => {
    await db.update(users).set({ webhookUrl: 'https://hook.example.com/test' }).where(eq(users.id, userId))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }) as any)

    const r = await post()
    expect(r.status).toBe(200)
    expect((await r.json()).ok).toBe(true)

    await db.update(users).set({ webhookUrl: null }).where(eq(users.id, userId))
  })

  it('returns ok=false with status_code when delivery fails', async () => {
    await db.update(users).set({ webhookUrl: 'https://hook.example.com/test' }).where(eq(users.id, userId))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('error', { status: 500 }) as any)

    const r = await post()
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.ok).toBe(false)
    expect(j.status_code).toBe(500)

    await db.update(users).set({ webhookUrl: null }).where(eq(users.id, userId))
  })

  it('requires auth (401 without token)', async () => {
    const r = await app.fetch(new Request('http://x/api/console/webhooks/test', { method: 'POST' }))
    expect(r.status).toBe(401)
  })
})
