// src/tests/email.live.test.ts
// FT: full HTTP stack + real SmtpMailer — verifies the forgot/reset flow
// actually delivers email end-to-end.
//
// Skipped automatically when SMTP_HOST/USER/PASS are not configured.
// Run manually:
//   env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/tests/email.live.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createApp } from '../app.js'
import { db, pool } from '../db/client.js' // pool used for cleanup in afterAll
import { users } from '../db/schema.js'
import { env } from '../env.js'
import { setMailer } from '../services/mailer/index.js'
import { SmtpMailer } from '../services/mailer/smtp.js'

const hasSmtp = !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS)

const app = createApp()

async function post(path: string, body: unknown) {
  return app.fetch(new Request('http://localhost' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

describe.skipIf(!hasSmtp)('password reset — live email (FT)', () => {
  const testEmail = `live-email-ft-${Date.now()}@example.com`

  beforeAll(async () => {
    await db.insert(users).values({
      email: testEmail,
      passwordHash: 'x',
      name: 'Live FT User',
      notifyEmail: true,
    })
    // Use real SmtpMailer so emails are actually delivered.
    setMailer(new SmtpMailer())
  })

  afterAll(async () => {
    setMailer(null)
    await pool.query(`DELETE FROM users WHERE email = '${testEmail}'`)
  })

  it('POST /forgot returns 200 and sends a real reset email', async () => {
    // Spy on SmtpMailer.send — calls through to real SMTP but captures args.
    const spy = vi.spyOn(SmtpMailer.prototype, 'send')

    const r = await post('/api/console/forgot', { email: testEmail })
    expect(r.status).toBe(200)
    expect((await r.json()).ok).toBe(true)

    // Verify the mailer was called once with correct recipient and a reset link.
    expect(spy).toHaveBeenCalledTimes(1)
    const call = spy.mock.calls[0]![0]
    expect(call.to).toBe(testEmail)
    expect(call.subject).toContain('密码重置')
    expect(call.text).toMatch(/reset-password\?token=[a-f0-9]{64}/)

    spy.mockRestore()
  }, 20_000)

  it('POST /forgot with unknown email returns 200 without sending', async () => {
    const spy = vi.spyOn(SmtpMailer.prototype, 'send')

    const r = await post('/api/console/forgot', { email: 'nobody@example.com' })
    expect(r.status).toBe(200)
    expect(spy).not.toHaveBeenCalled()

    spy.mockRestore()
  }, 10_000)
})
