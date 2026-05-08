// src/services/mailer/index.ts
import type { Mailer } from './interface.js'
import { ConsoleMailer } from './console.js'
import { SmtpMailer } from './smtp.js'
import { env } from '../../env.js'

export type { Mailer, SendOptions } from './interface.js'

let _mailer: Mailer | null = null

export function getMailer(): Mailer {
  if (_mailer) return _mailer
  _mailer = env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS
    ? new SmtpMailer()
    : new ConsoleMailer()
  return _mailer
}

// Test helper: override the singleton (call with null to reset).
export function setMailer(m: Mailer | null): void {
  _mailer = m
}
