import type { EventContext } from '@cloudflare/workers-types'

export interface Env {
  DB: any
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
