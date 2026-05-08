// src/services/mailer/smtp.ts
import nodemailer from 'nodemailer'
import type { Mailer, SendOptions } from './interface.js'
import { env } from '../../env.js'

export class SmtpMailer implements Mailer {
  private transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  })

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
