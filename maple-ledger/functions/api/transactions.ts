import type { EventContext } from '@cloudflare/workers-types'
import { nanoid } from 'nanoid'
import type { Env, AppLocals } from './_middleware.js'

function calcAmountCad(type: string, amount: number, usdRmbRate: number | null, cadUsdRate: number | null): number {
  if (type === 'expense') return amount
  if (!usdRmbRate || !cadUsdRate) throw new Error('income requires usd_rmb_rate and cad_usd_market_rate')
  return amount / usdRmbRate * cadUsdRate
}

export const onRequestGet = async (ctx: EventContext<Env, string, AppLocals>) => {
  const url = new URL(ctx.request.url)
  const month = url.searchParams.get('month')
  const type = url.searchParams.get('type')
  const category = url.searchParams.get('category')

  let query = 'SELECT * FROM transactions WHERE 1=1'
  const params: string[] = []

  if (month) {
    query += ' AND date LIKE ?'
    params.push(`${month}%`)
  }
  if (type) {
    query += ' AND type = ?'
    params.push(type)
  }
  if (category) {
    query += ' AND category = ?'
    params.push(category)
  }
  query += ' ORDER BY date DESC, created_at DESC'

  const rows = await ctx.env.DB.prepare(query).bind(...params).all()
  return Response.json(rows.results)
}

export const onRequestPost = async (ctx: EventContext<Env, string, AppLocals>) => {
  const body = await ctx.request.json() as {
    type: string; date: string; amount: number; currency: string
    usdRmbRate?: number; cadUsdMarketRate?: number; note?: string
    category: string; tax?: number; bankRate?: number; marketRateAtPurchase?: number
  }

  let amountCad: number
  try {
    amountCad = calcAmountCad(body.type, body.amount, body.usdRmbRate ?? null, body.cadUsdMarketRate ?? null)
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 400 })
  }

  const id = nanoid()
  await ctx.env.DB.prepare(`
    INSERT INTO transactions
      (id, type, date, amount, currency, usd_rmb_rate, cad_usd_market_rate, amount_cad,
       note, category, tax, bank_rate, market_rate_at_purchase, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.type, body.date, body.amount, body.currency,
    body.usdRmbRate ?? null, body.cadUsdMarketRate ?? null, amountCad,
    body.note ?? null, body.category,
    body.tax ?? null, body.bankRate ?? null, body.marketRateAtPurchase ?? null,
    ctx.data.userEmail,
  ).run()

  const row = await ctx.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first()
  return Response.json(row, { status: 201 })
}
