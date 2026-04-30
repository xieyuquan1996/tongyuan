import { Hono } from 'hono'
import { db } from '../../db/client.js'
import { models } from '../../db/schema.js'
import { eq, desc } from 'drizzle-orm'

export const publicModels = new Hono()

publicModels.get('/', async (c) => {
  const rows = await db.select().from(models).where(eq(models.enabled, true)).orderBy(desc(models.recommended), desc(models.id))
  return c.json({
    models: rows.map((r) => ({
      id: r.id,
      context: `${Math.round(Number(r.contextWindow) / 1000)}k`,
      price: `$${Number(r.inputPriceUsdPerMtok).toFixed(0)} / $${Number(r.outputPriceUsdPerMtok).toFixed(0)}`,
      input_price_usd_per_mtok: r.inputPriceUsdPerMtok,
      output_price_usd_per_mtok: r.outputPriceUsdPerMtok,
      note: r.note,
      recommended: r.recommended,
    })),
  })
})
