import type { EventContext } from '@cloudflare/workers-types'
import type { Env, AppLocals } from '../_middleware.js'

export const onRequestPut = async (ctx: EventContext<Env, string, AppLocals>) => {
  const id = ctx.params['id'] as string
  let body: Record<string, unknown>
  try {
    body = await ctx.request.json() as Record<string, unknown>
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const existing = await ctx.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first()
  if (!existing) return Response.json({ error: 'not_found' }, { status: 404 })

  const fields: string[] = []
  const vals: unknown[] = []

  const allowed = ['type','date','amount','currency','usd_rmb_rate','cad_usd_market_rate',
    'amount_cad','note','category','tax','bank_rate','market_rate_at_purchase']
  for (const key of allowed) {
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
    if (camel in body || key in body) {
      fields.push(`${key} = ?`)
      vals.push((body as Record<string, unknown>)[camel] ?? (body as Record<string, unknown>)[key] ?? null)
    }
  }

  if (!fields.length) return Response.json({ error: 'no fields to update' }, { status: 400 })

  fields.push('updated_at = datetime(\'now\')')
  vals.push(id)

  await ctx.env.DB.prepare(`UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()

  const row = await ctx.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first()
  return Response.json(row)
}

export const onRequestDelete = async (ctx: EventContext<Env, string, AppLocals>) => {
  const id = ctx.params['id'] as string
  const existing = await ctx.env.DB.prepare('SELECT id FROM transactions WHERE id = ?').bind(id).first()
  if (!existing) return Response.json({ error: 'not_found' }, { status: 404 })

  await ctx.env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run()
  return new Response(null, { status: 204 })
}
