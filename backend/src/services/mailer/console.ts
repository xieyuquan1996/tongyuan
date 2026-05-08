// src/services/mailer/console.ts
import type { Mailer, SendOptions } from './interface.js'

export class ConsoleMailer implements Mailer {
  async send(opts: SendOptions): Promise<void> {
    console.log(`[mailer:console] to=${opts.to} subject="${opts.subject}"\n${opts.text}`)
  }
}
