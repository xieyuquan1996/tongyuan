import type { EventContext } from '@cloudflare/workers-types'
import type { Env } from './_middleware.js'

export async function fetchCadUsdRate(db: any, pair = 'CAD_USD'): Promise<{ rate: number; date: string; source: string }> {
  const today = new Date().toISOString().slice(0, 10)

  const cached = await db.prepare(
    'SELECT rate, date FROM exchange_rate_cache WHERE pair = ? AND date = ?'
  ).bind(pair, today).first() as { rate: number; date: string } | undefined

  if (cached) return { rate: cached.rate, date: cached.date, source: 'cache' }

  const res = await fetch(`https://open.er-api.com/v6/latest/CAD`)
  if (!res.ok) throw new Error(`exchange rate fetch failed: ${res.status}`)
  const data = await res.json() as { rates: Record<string, number>; date: string }
  const rate = data.rates['USD']
  if (!rate) throw new Error('CAD/USD rate not found in response')

  await db.prepare(
    'INSERT OR REPLACE INTO exchange_rate_cache (pair, rate, date) VALUES (?, ?, ?)'
  ).bind(pair, rate, today).run()

  return { rate, date: today, source: 'api' }
}

export const onRequestGet = async (ctx: EventContext<Env, string, Record<string, string>>) => {
  try {
    const result = await fetchCadUsdRate(ctx.env.DB)
    return Response.json(result)
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
