// src/services/mailer/interface.ts
export type SendOptions = {
  to: string
  subject: string
  text: string
  html?: string
}

export interface Mailer {
  send(opts: SendOptions): Promise<void>
}
