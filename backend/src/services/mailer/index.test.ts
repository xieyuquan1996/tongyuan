// src/services/mailer/index.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { getMailer, setMailer } from './index.js'
import { ConsoleMailer } from './console.js'
import { SmtpMailer } from './smtp.js'
import { env } from '../../env.js'

const hasSmtp = !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS)
// When SMTP is configured, getMailer() returns SmtpMailer; otherwise ConsoleMailer.
const ExpectedMailer = hasSmtp ? SmtpMailer : ConsoleMailer

describe('getMailer()', () => {
  afterEach(() => {
    // Reset singleton between tests
    setMailer(null)
  })

  it('returns the correct mailer based on SMTP env config', () => {
    const mailer = getMailer()
    expect(mailer).toBeInstanceOf(ExpectedMailer)
  })

  it('returns the same singleton on repeated calls', () => {
    const first = getMailer()
    const second = getMailer()
    expect(first).toBe(second)
  })

  it('setMailer overrides the singleton', () => {
    const mock = new ConsoleMailer()
    setMailer(mock)
    expect(getMailer()).toBe(mock)
  })

  it('setMailer(null) resets the singleton so a new instance is created', () => {
    const first = getMailer()
    setMailer(null)
    const second = getMailer()
    expect(second).toBeInstanceOf(ExpectedMailer)
    expect(second).not.toBe(first)
  })
})
