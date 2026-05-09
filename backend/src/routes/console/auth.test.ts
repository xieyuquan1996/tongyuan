// backend/src/routes/console/auth.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { createApp } from '../../app.js'
import { pool } from '../../db/client.js'
import { setMailer } from '../../services/mailer/index.js'
import type { SendOptions } from '../../services/mailer/index.js'

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
    const r1 = await post('/api/console/register', { email, password: 'secret123456', name: 'T' })
    expect(r1.status).toBe(201)
    const j1 = await r1.json()
    expect(j1.user.email).toBe(email)
    expect(j1.session.token).toBeDefined()

    const r2 = await post('/api/console/login', { email, password: 'secret123456' })
    expect(r2.status).toBe(200)
    const j2 = await r2.json()
    expect(j2.session.token).not.toBe(j1.session.token)
  })

  it('rejects duplicate email', async () => {
    const email = `auth-test-${Date.now()}-dup@example.com`
    await post('/api/console/register', { email, password: 'secret123456' })
    const r = await post('/api/console/register', { email, password: 'secret123456' })
    expect(r.status).toBe(409)
    expect((await r.json()).error).toBe('email_exists')
  })

  it('rejects weak password', async () => {
    const r = await post('/api/console/register', { email: 'wp@x.com', password: '12' })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('weak_password')
  })

  it('rejects password shorter than 12 characters', async () => {
    const r = await post('/api/console/register', { email: `auth-test-${Date.now()}-short@x.com`, password: 'short12345' })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('weak_password')
  })

  it('rejects email longer than 254 characters', async () => {
    const longEmail = 'a'.repeat(250) + '@x.com'
    const r = await post('/api/console/register', { email: longEmail, password: 'validpass123456' })
    expect(r.status).toBe(400)
  })

  it('rejects password longer than 128 characters', async () => {
    const longPw = 'a'.repeat(129)
    const r = await post('/api/console/register', { email: `auth-test-${Date.now()}-longpw@x.com`, password: longPw })
    expect(r.status).toBe(400)
  })

  it('locks account after 5 failed attempts', async () => {
    const email = `auth-test-${Date.now()}-lock@example.com`
    await post('/api/console/register', { email, password: 'correct123456' })

    for (let i = 0; i < 4; i++) {
      const r = await post('/api/console/login', { email, password: 'wrong' })
      expect(r.status).toBe(401)
      expect((await r.json()).error).toBe('invalid_credentials')
    }

    // 5th attempt triggers lockout
    const r5 = await post('/api/console/login', { email, password: 'wrong' })
    expect(r5.status).toBe(403)
    const r5body = await r5.json() as any
    expect(r5body.error).toBe('account_locked')
    // message must not reveal lockout duration to prevent timing analysis
    expect(r5body.message ?? '').not.toMatch(/\d+\s*(分钟|minute)/)

    // Correct password also blocked while locked
    const rOk = await post('/api/console/login', { email, password: 'correct123456' })
    expect(rOk.status).toBe(403)
    const rOkBody = await rOk.json() as any
    expect(rOkBody.error).toBe('account_locked')
    expect(rOkBody.message ?? '').not.toMatch(/\d+\s*(分钟|minute)/)
  })

  describe('password reset', () => {
    let resetEmail: string
    let capturedToken: string
    let mailCalls: SendOptions[] = []

    beforeAll(async () => {
      resetEmail = `auth-test-reset-${Date.now()}@example.com`
      await post('/api/console/register', { email: resetEmail, password: 'oldpass123456', name: 'R' })
    })

    beforeEach(() => {
      mailCalls = []
      setMailer({ async send(o) { mailCalls.push(o) } })
    })

    afterEach(() => {
      setMailer(null)
    })

    it('forgot with unknown email returns 200 (no enumeration)', async () => {
      const r = await post('/api/console/forgot', { email: 'nobody@example.com' })
      expect(r.status).toBe(200)
      expect((await r.json()).ok).toBe(true)
    })

    it('forgot with known email returns 200 and stores token in Redis', async () => {
      const r = await post('/api/console/forgot', { email: resetEmail })
      expect(r.status).toBe(200)

      expect(mailCalls).toHaveLength(1)
      const match = mailCalls[0]!.text.match(/token=([a-f0-9]{64})/)
      expect(match).toBeTruthy()
      capturedToken = match![1]!
    })

    it('reset with invalid token returns 400', async () => {
      const r = await post('/api/console/reset', { token: 'a'.repeat(64), password: 'newpass123456' })
      expect(r.status).toBe(400)
      expect((await r.json()).error).toBe('invalid_or_expired_token')
    })

    it('reset with weak password returns 400', async () => {
      const r = await post('/api/console/reset', { token: capturedToken, password: '123' })
      expect(r.status).toBe(400)
      expect((await r.json()).error).toBe('weak_password')
    })

    it('reset with valid token updates password and token is deleted', async () => {
      const r = await post('/api/console/reset', { token: capturedToken, password: 'newpass123456' })
      expect(r.status).toBe(200)
      expect((await r.json()).ok).toBe(true)

      // Can now login with new password
      const r2 = await post('/api/console/login', { email: resetEmail, password: 'newpass123456' })
      expect(r2.status).toBe(200)

      // Token is one-time: second reset with same token fails
      const r3 = await post('/api/console/reset', { token: capturedToken, password: 'anotherpass12' })
      expect(r3.status).toBe(400)
      expect((await r3.json()).error).toBe('invalid_or_expired_token')
    })
  })
})
