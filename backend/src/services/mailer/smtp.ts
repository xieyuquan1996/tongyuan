// src/services/mailer/smtp.ts
import nodemailer from 'nodemailer'
import type { Mailer, SendOptions } from './interface.js'
import { env } from '../../env.js'

export class SmtpMailer implements Mailer {
  private transporter: ReturnType<typeof nodemailer.createTransport>

  constructor() {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
      throw new Error('SmtpMailer requires SMTP_HOST, SMTP_USER, and SMTP_PASS')
    }
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    })
  }

  async send(opts: SendOptions): Promise<void> {
    const from = env.SMTP_FROM ?? env.SMTP_USER
    await this.transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    })
  }
}
