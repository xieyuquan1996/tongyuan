// backend/src/routes/console/auth.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../../app.js'
import { pool } from '../../db/client.js'

const app = createApp()

async function post(path: string, body: unknown) {
  return app.fetch(new Request('http://localhost' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

beforeAll(async () => {
  await pool.query("DELETE FROM sessions; DELETE FROM users WHERE email LIKE 'auth-test-%'")
})
afterAll(async () => { await pool.end() })

describe('auth routes', () => {
  it('registers then logs in', async () => {
    const email = `auth-test-${Date.now()}@example.com`
    const r1 = await post('/api/console/register', { email, password: 'secret123', name: 'T' })
    expect(r1.status).toBe(201)
    const j1 = await r1.json()
    expect(j1.user.email).toBe(email)
    expect(j1.session.token).toBeDefined()

    const r2 = await post('/api/console/login', { email, password: 'secret123' })
    expect(r2.status).toBe(200)
    const j2 = await r2.json()
    expect(j2.session.token).not.toBe(j1.session.token)
  })

  it('rejects duplicate email', async () => {
    const email = `auth-test-${Date.now()}-dup@example.com`
    await post('/api/console/register', { email, password: 'secret123' })
    const r = await post('/api/console/register', { email, password: 'secret123' })
    expect(r.status).toBe(409)
    expect((await r.json()).error).toBe('email_exists')
  })

  it('rejects weak password', async () => {
    const r = await post('/api/console/register', { email: 'wp@x.com', password: '12' })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('weak_password')
  })
})
