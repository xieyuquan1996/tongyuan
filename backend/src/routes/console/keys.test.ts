// backend/src/routes/console/keys.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../../app.js'
import { pool } from '../../db/client.js'

const app = createApp()
let token = ''

beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email='keys-test@example.com'")
  const r = await app.fetch(new Request('http://x/api/console/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'keys-test@example.com', password: 'secret123' }),
  }))
  token = (await r.json()).session.token
})
afterAll(async () => { await pool.end() })

async function req(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${token}`)
  headers.set('content-type', 'application/json')
  return app.fetch(new Request('http://x' + path, { ...init, headers }))
}

describe('keys routes', () => {
  it('creates then lists then revokes', async () => {
    const c = await req('/api/console/keys', { method: 'POST', body: JSON.stringify({ name: 'k1' }) })
    expect(c.status).toBe(201)
    const cj = await c.json()
    expect(cj.secret).toMatch(/^sk-relay-/)
    expect(cj.prefix).toBe(cj.secret.slice(0, 16))

    const l = await req('/api/console/keys')
    const lj = await l.json()
    expect(lj.keys.some((k: any) => k.id === cj.id && k.secret === undefined)).toBe(true)

    const r = await req(`/api/console/keys/${cj.id}/revoke`, { method: 'POST' })
    expect((await r.json()).state).toBe('revoked')
  })
})
