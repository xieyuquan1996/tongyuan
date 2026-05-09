import type { EventContext } from '@cloudflare/workers-types'
import type { Env } from '../_middleware.js'

export const onRequestGet = async (ctx: EventContext<Env, string, Record<string, string>>) => {
  const url = new URL(ctx.request.url)
  const from = url.searchParams.get('from') ?? '2000-01-01'
  const to = url.searchParams.get('to') ?? '2999-12-31'

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return Response.json({ error: 'from/to must be YYYY-MM-DD' }, { status: 400 })
  }

  try {
    const rows = await ctx.env.DB.prepare(`
      SELECT id, date, amount, bank_rate, market_rate_at_purchase,
        (amount - (amount / bank_rate) * market_rate_at_purchase) AS loss_cad,
        ((bank_rate - market_rate_at_purchase) / market_rate_at_purchase * 100) AS loss_pct
      FROM transactions
      WHERE type = 'expense'
        AND bank_rate IS NOT NULL
        AND market_rate_at_purchase IS NOT NULL
        AND date BETWEEN ? AND ?
      ORDER BY date DESC
    `).bind(from, to).all<{
      id: string; date: string; amount: number; bank_rate: number
      market_rate_at_purchase: number; loss_cad: number; loss_pct: number
    }>()

    const records = rows.results
    const total_loss_cad = records.reduce((s, r) => s + r.loss_cad, 0)
    const total_amount = records.reduce((s, r) => s + r.amount, 0)
    const avg_loss_pct = total_amount > 0
      ? records.reduce((s, r) => s + r.loss_pct * r.amount, 0) / total_amount
      : 0

    return Response.json({ total_loss_cad, avg_loss_pct, records })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
