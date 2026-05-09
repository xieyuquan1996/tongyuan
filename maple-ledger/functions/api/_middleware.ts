import type { EventContext, D1Database } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
}

export interface AppLocals {
  userEmail: string
}

export const onRequest = [
  async (ctx: EventContext<Env, string, AppLocals>) => {
    const email = ctx.request.headers.get('Cf-Access-Authenticated-User-Email') ?? 'dev@local'
    ctx.data.userEmail = email
    return ctx.next()
  },
]
