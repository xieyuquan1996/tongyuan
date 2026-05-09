import type { EventContext } from '@cloudflare/workers-types'
import type { Env } from '../_middleware.js'

export const onRequestGet = async (ctx: EventContext<Env, string, Record<string, string>>) => {
  const url = new URL(ctx.request.url)
  const month = url.searchParams.get('month') ?? new Date().toISOString().slice(0, 7)

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }

  try {
    const row = await ctx.env.DB.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type='income' AND currency='RMB' THEN amount ELSE 0 END), 0) AS income_rmb,
        COALESCE(SUM(CASE WHEN type='income' THEN amount_cad ELSE 0 END), 0) AS income_cad,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount_cad ELSE 0 END), 0) AS expense_cad,
        COUNT(*) AS tx_count
      FROM transactions
      WHERE date LIKE ?
    `).bind(`${month}%`).first<{
      income_rmb: number; income_cad: number; expense_cad: number; tx_count: number
    }>()

    const income_cad = row?.income_cad ?? 0
    const expense_cad = row?.expense_cad ?? 0
    const profit_cad = income_cad - expense_cad

    return Response.json({
      month,
      income_rmb: row?.income_rmb ?? 0,
      income_cad,
      expense_cad,
      profit_cad,
      tx_count: row?.tx_count ?? 0,
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
