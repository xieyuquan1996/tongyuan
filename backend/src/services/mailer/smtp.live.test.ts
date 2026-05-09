// src/services/mailer/smtp.live.test.ts
// CT: actually sends a real email via SMTP.
// Skipped automatically when SMTP_HOST/USER/PASS are not configured.
// Run manually: env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/services/mailer/smtp.live.test.ts
import { describe, it, expect } from 'vitest'
import { env } from '../../env.js'
import { SmtpMailer } from './smtp.js'

const hasSmtp = !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS)

describe.skipIf(!hasSmtp)('SmtpMailer — live SMTP (CT)', () => {
  it('delivers a test email to SMTP_USER inbox', async () => {
    const mailer = new SmtpMailer()
    await expect(
      mailer.send({
        to: env.SMTP_USER!,
        subject: `[Maplelink Test] SmtpMailer live CT — ${new Date().toISOString()}`,
        text: [
          'This is an automated live test from the Maplelink test suite.',
          '',
          `SMTP_HOST : ${env.SMTP_HOST}`,
          `SMTP_USER : ${env.SMTP_USER}`,
          `SMTP_FROM : ${env.SMTP_FROM ?? '(fallback to SMTP_USER)'}`,
          `Sent at   : ${new Date().toISOString()}`,
        ].join('\n'),
      }),
    ).resolves.toBeUndefined()
  }, 15_000)
})
