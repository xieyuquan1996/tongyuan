// src/services/mailer/smtp.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock nodemailer before importing SmtpMailer
vi.mock('nodemailer', () => {
  const sendMail = vi.fn().mockResolvedValue({})
  const createTransport = vi.fn().mockReturnValue({ sendMail })
  return { default: { createTransport } }
})

// Mock env before importing SmtpMailer
vi.mock('../../env.js', () => ({
  env: {
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: 587,
    SMTP_USER: 'user@example.com',
    SMTP_PASS: 'secret',
    SMTP_FROM: undefined,
  },
}))

import nodemailer from 'nodemailer'
import { SmtpMailer } from './smtp.js'

// Helper to access the mocked sendMail function
function getMockSendMail() {
  const mockCreateTransport = nodemailer.createTransport as ReturnType<typeof vi.fn>
  const lastResult = mockCreateTransport.mock.results[mockCreateTransport.mock.results.length - 1]
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return lastResult!.value.sendMail as ReturnType<typeof vi.fn>
}

describe('SmtpMailer', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('throws if SMTP_HOST is missing', async () => {
    const { env } = await import('../../env.js')
    const originalHost = env.SMTP_HOST
    ;(env as any).SMTP_HOST = undefined
    expect(() => new SmtpMailer()).toThrow('SmtpMailer requires SMTP_HOST, SMTP_USER, and SMTP_PASS')
    ;(env as any).SMTP_HOST = originalHost
  })

  it('throws if SMTP_USER is missing', async () => {
    const { env } = await import('../../env.js')
    const originalUser = env.SMTP_USER
    ;(env as any).SMTP_USER = undefined
    expect(() => new SmtpMailer()).toThrow('SmtpMailer requires SMTP_HOST, SMTP_USER, and SMTP_PASS')
    ;(env as any).SMTP_USER = originalUser
  })

  it('throws if SMTP_PASS is missing', async () => {
    const { env } = await import('../../env.js')
    const originalPass = env.SMTP_PASS
    ;(env as any).SMTP_PASS = undefined
    expect(() => new SmtpMailer()).toThrow('SmtpMailer requires SMTP_HOST, SMTP_USER, and SMTP_PASS')
    ;(env as any).SMTP_PASS = originalPass
  })

  it('passes SendOptions fields to sendMail', async () => {
    const mailer = new SmtpMailer()
    const sendMail = getMockSendMail()

    await mailer.send({
      to: 'recipient@example.com',
      subject: 'Hello',
      text: 'Plain text',
      html: '<p>HTML</p>',
    })

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'recipient@example.com',
        subject: 'Hello',
        text: 'Plain text',
        html: '<p>HTML</p>',
      }),
    )
  })

  it('falls back to SMTP_USER as from when SMTP_FROM is not set', async () => {
    const { env } = await import('../../env.js')
    ;(env as any).SMTP_FROM = undefined

    const mailer = new SmtpMailer()
    const sendMail = getMockSendMail()

    await mailer.send({ to: 'a@b.com', subject: 'Sub', text: 'body' })

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'user@example.com' }),
    )
  })

  it('uses SMTP_FROM when set', async () => {
    const { env } = await import('../../env.js')
    ;(env as any).SMTP_FROM = 'noreply@myapp.com'

    const mailer = new SmtpMailer()
    const sendMail = getMockSendMail()

    await mailer.send({ to: 'a@b.com', subject: 'Sub', text: 'body' })

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'noreply@myapp.com' }),
    )

    ;(env as any).SMTP_FROM = undefined
  })

  it('propagates errors thrown by sendMail', async () => {
    const mailer = new SmtpMailer()
    const sendMail = getMockSendMail()
    sendMail.mockRejectedValueOnce(new Error('SMTP connection refused'))

    await expect(
      mailer.send({ to: 'a@b.com', subject: 'Sub', text: 'body' }),
    ).rejects.toThrow('SMTP connection refused')
  })
})
