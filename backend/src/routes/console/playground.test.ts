// backend/src/routes/console/playground.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../../app.js'
import { pool, db } from '../../db/client.js'
import { models, upstreamKeys, requestLogs, users } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

const app = createApp()
let token = ''
let userId = ''

beforeAll(async () => {
  await db.insert(models).values({
    id: 'test-model-playground',
    displayName: 'Test Playground',
    inputPriceUsdPerMtok: '3',
    outputPriceUsdPerMtok: '15',
    enabled: true,
  }).onConflictDoNothing()

  const email = `pg-${Date.now()}@example.com`
  const r = await app.fetch(new Request('http://x/api/console/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123' }),
  }))
  const j = await r.json()
  token = j.session.token
  userId = j.user.id
  // Playground 只对 admin 开放，所以把测试账号提权。
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, userId))
})

afterAll(async () => { await pool.end() })

async function post(body: any, withAuth = true) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (withAuth) headers.authorization = `Bearer ${token}`
  return app.fetch(new Request('http://x/api/console/playground', {
    method: 'POST', headers, body: JSON.stringify(body),
  }))
}

describe('playground', () => {
  it('requires auth', async () => {
    const r = await post({ model: 'test-model-playground', messages: [] }, false)
    expect(r.status).toBe(401)
  })

  it('rejects missing model', async () => {
    const r = await post({ messages: [{ role: 'user', content: 'hi' }] })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('missing_fields')
  })

  it('rejects unknown model', async () => {
    const r = await post({ model: 'does-not-exist', messages: [{ role: 'user', content: 'hi' }] })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('unknown_model')
  })

  it('accepts stream:true (no longer 501 — handleStream takes it)', async () => {
    // We can't easily verify the SSE stream body without a live upstream,
    // but the regression we care about is that the route stops returning
    // not_implemented. With no upstream pool, this path falls through to
    // all_upstreams_down which is a 502 — that's still proof the stream
    // branch was taken (the old code threw 501 *before* even trying the
    // upstream).
    const active = await db.select().from(upstreamKeys).where(eq(upstreamKeys.state, 'active'))
    const r = await post({
      model: 'test-model-playground',
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(r.status).not.toBe(501)
    if (active.length === 0) {
      expect(r.status).toBe(502)
    }
  })

  it('all-upstreams-down still writes a log row', async () => {
    const active = await db.select().from(upstreamKeys).where(eq(upstreamKeys.state, 'active'))
    if (active.length > 0) {
      // Another test/env owns the upstream pool; skip this scenario.
      return
    }

    const before = await db.select().from(requestLogs).where(eq(requestLogs.userId, userId))
    const r = await post({
      model: 'test-model-playground',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(r.status).toBe(502)
    const body = await r.json()
    expect(body.error).toBe('all_upstreams_down')

    const after = await db.select().from(requestLogs).where(eq(requestLogs.userId, userId))
    expect(after.length).toBe(before.length + 1)
    const latest = after[after.length - 1]!
    expect(Number(latest.status)).toBe(502)
    expect(latest.errorCode).toBe('all_upstreams_down')
  })
})
