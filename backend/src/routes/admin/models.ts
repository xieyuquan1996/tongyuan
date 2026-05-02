// backend/src/routes/admin/models.ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import * as svc from '../../services/models.js'
import * as upstream from '../../services/upstream-keys.js'
import * as audit from '../../services/audit.js'
import { db } from '../../db/client.js'
import { models } from '../../db/schema.js'

export const adminModelsRoutes = new Hono()
adminModelsRoutes.use('*', requireBearer, requireAdmin)

// Parse "$3 / $15" → { input: "3", output: "15" }
function parsePrice(price: string): { input: string; output: string } | null {
  const m = price.match(/\$?([\d.]+)\s*\/\s*\$?([\d.]+)/)
  if (!m) return null
  return { input: m[1]!, output: m[2]! }
}

// Parse "200k" / "128k" / "200000" → number
function parseContext(ctx: string): number {
  const m = ctx.match(/^([\d.]+)\s*([kKmM]?)$/)
  if (!m) return 200000
  const n = parseFloat(m[1]!)
  const unit = m[2]!.toLowerCase()
  if (unit === 'k') return Math.round(n * 1000)
  if (unit === 'm') return Math.round(n * 1_000_000)
  return Math.round(n)
}

function toDisplayRow(r: svc.ModelRow) {
  const inP = Number(r.inputPriceUsdPerMtok ?? 0)
  const outP = Number(r.outputPriceUsdPerMtok ?? 0)
  const ctx = Number(r.contextWindow ?? 200000)
  return {
    id: r.id,
    display_name: r.displayName,
    context: ctx >= 1_000_000 ? (ctx / 1_000_000).toFixed(0) + 'M' : (ctx / 1000).toFixed(0) + 'k',
    price: `$${inP} / $${outP}`,
    note: r.note,
    recommended: r.recommended,
    enabled: r.enabled,
    markup_pct: r.markupPct,
    input_price_usd_per_mtok: r.inputPriceUsdPerMtok,
    output_price_usd_per_mtok: r.outputPriceUsdPerMtok,
    cache_read_price_usd_per_mtok: r.cacheReadPriceUsdPerMtok,
    cache_write_price_usd_per_mtok: r.cacheWritePriceUsdPerMtok,
    cache_write_1h_price_usd_per_mtok: r.cacheWrite1hPriceUsdPerMtok,
    synced_at: r.syncedAt,
  }
}

adminModelsRoutes.get('/', async (c) => {
  const rows = await svc.list({ enabledOnly: false })
  return c.json({ models: rows.map(toDisplayRow) })
})

adminModelsRoutes.post('/', zValidator('json', z.object({
  id: z.string().min(1),
  context: z.string().optional().default('200k'),
  price: z.string().optional().default('$0 / $0'),
  note: z.string().optional().default(''),
})), async (c) => {
  const b = c.req.valid('json')
  const parsed = parsePrice(b.price)
  const [row] = await db.insert(models).values({
    id: b.id,
    displayName: b.id,
    contextWindow: String(parseContext(b.context)),
    inputPriceUsdPerMtok: parsed?.input ?? '0',
    outputPriceUsdPerMtok: parsed?.output ?? '0',
    note: b.note,
    syncedAt: new Date(),
  }).returning()
  await audit.record({
    actor: c.get('user'),
    action: 'admin.model.create',
    target: row!.id,
    metadata: { context: b.context, price: b.price, note: b.note },
  })
  return c.json(toDisplayRow(row!), 201)
})

adminModelsRoutes.post('/sync', async (c) => {
  const active = await upstream.pickActive()
  if (active.length === 0) {
    // No upstream key — still return success with empty lists so UI doesn't break
    return c.json({ added: [], updated: [] })
  }
  const apiKey = await upstream.decrypt(active[0]!)
  const result = await svc.sync(apiKey)
  return c.json(result)
})

adminModelsRoutes.patch('/:id', zValidator('json', z.object({
  display_name: z.string().optional(),
  context: z.string().optional(),
  price: z.string().optional(),
  markup_pct: z.string().optional(),
  enabled: z.boolean().optional(),
  recommended: z.boolean().optional(),
  note: z.string().optional(),
  input_price_usd_per_mtok: z.string().optional(),
  output_price_usd_per_mtok: z.string().optional(),
  cache_read_price_usd_per_mtok: z.string().nullable().optional(),
  cache_write_price_usd_per_mtok: z.string().nullable().optional(),
  cache_write_1h_price_usd_per_mtok: z.string().nullable().optional(),
})), async (c) => {
  const b = c.req.valid('json')
  const p: Parameters<typeof svc.patch>[1] = {}
  if (b.display_name !== undefined) p.displayName = b.display_name
  if (b.markup_pct !== undefined) p.markupPct = b.markup_pct
  if (b.enabled !== undefined) p.enabled = b.enabled
  if (b.recommended !== undefined) p.recommended = b.recommended
  if (b.note !== undefined) p.note = b.note
  if (b.context !== undefined) p.contextWindow = String(parseContext(b.context))
  if (b.price !== undefined) {
    const parsed = parsePrice(b.price)
    if (parsed) { p.inputPriceUsdPerMtok = parsed.input; p.outputPriceUsdPerMtok = parsed.output }
  }
  if (b.input_price_usd_per_mtok !== undefined) p.inputPriceUsdPerMtok = b.input_price_usd_per_mtok
  if (b.output_price_usd_per_mtok !== undefined) p.outputPriceUsdPerMtok = b.output_price_usd_per_mtok
  if (b.cache_read_price_usd_per_mtok !== undefined) p.cacheReadPriceUsdPerMtok = b.cache_read_price_usd_per_mtok
  if (b.cache_write_price_usd_per_mtok !== undefined) p.cacheWritePriceUsdPerMtok = b.cache_write_price_usd_per_mtok
  if (b.cache_write_1h_price_usd_per_mtok !== undefined) p.cacheWrite1hPriceUsdPerMtok = b.cache_write_1h_price_usd_per_mtok
  const id = c.req.param('id')
  const row = await svc.patch(id, p)
  await audit.record({
    actor: c.get('user'),
    action: 'admin.model.update',
    target: id,
    metadata: { patch: b },
  })
  return c.json(toDisplayRow(row))
})

adminModelsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await svc.remove(id)
  await audit.record({
    actor: c.get('user'),
    action: 'admin.model.delete',
    target: id,
  })
  return c.json({ ok: true })
})

