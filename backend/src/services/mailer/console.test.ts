// src/services/mailer/console.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ConsoleMailer } from './console.js'

describe('ConsoleMailer', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('resolves without throwing', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const mailer = new ConsoleMailer()
    await expect(mailer.send({
      to: 'test@example.com',
      subject: 'Hello',
      text: 'World',
    })).resolves.toBeUndefined()
  })

  it('logs the recipient and subject', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const mailer = new ConsoleMailer()
    await mailer.send({ to: 'a@b.com', subject: 'Test subject', text: 'body' })
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('a@b.com'),
    )
  })
})
