// src/services/mailer/index.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { getMailer, setMailer } from './index.js'
import { ConsoleMailer } from './console.js'

describe('getMailer()', () => {
  afterEach(() => {
    // Reset singleton between tests
    setMailer(null)
  })

  it('returns ConsoleMailer when SMTP vars are absent from env', () => {
    // In test environment SMTP vars are not set, so should fall back to ConsoleMailer
    const mailer = getMailer()
    expect(mailer).toBeInstanceOf(ConsoleMailer)
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
    // Both should be ConsoleMailer but different instances
    expect(second).toBeInstanceOf(ConsoleMailer)
    expect(second).not.toBe(first)
  })
})
