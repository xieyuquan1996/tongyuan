// backend/src/routes/admin/upstream-keys.ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import * as svc from '../../services/upstream-keys.js'
import * as audit from '../../services/audit.js'
import * as quota from '../../gateway/quota.js'
import * as quotaConfig from '../../gateway/quota-config.js'
import { type Family } from '../../gateway/family.js'

export const upstreamKeysRoutes = new Hono()
upstreamKeysRoutes.use('*', requireBearer, requireAdmin)

upstreamKeysRoutes.get('/', async (c) => {
  const rows = await svc.list()
  return c.json({ upstream_keys: rows.map(svc.toPublic) })
})

// Current-minute usage per key × family. Handy for the admin console to
// render "Opus: 12/50 RPM, 18k/30k ITPM" live bars, and for humans to spot
// whether the pool is actually balanced.
upstreamKeysRoutes.get('/quota', async (c) => {
  const rows = await svc.list()
  const families: Family[] = ['opus', 'sonnet', 'haiku']
  const out: any[] = []
  for (const row of rows) {
    const budgets = await quotaConfig.resolveAllBudgets(row.id)
    const perFamily: Record<string, any> = {}
    for (const fam of families) {
      const snap = await quota.snapshotFamily(row.id, fam)
      const budget = budgets[fam]
      perFamily[fam] = {
        bucket: snap.bucket,
        rpm: { used: snap.req, limit: budget.rpm },
        itpm: { used: snap.inTok, limit: budget.itpmExclCache },
        otpm: { used: snap.outTok, limit: budget.otpm },
        cooldown_until: snap.cooldownUntil,
      }
    }
    out.push({
      id: row.id,
      alias: row.alias,
      state: row.state,
      priority: row.priority,
      families: perFamily,
    })
  }
  return c.json({ upstream_keys: out })
})

// Per-key quota override. Leave a family out (or null) to fall through to the
// global default. PUT replaces whatever was there; send {} to clear.
const familyBudgetSchema = z.object({
  rpm: z.number().int().positive(),
  itpmExclCache: z.number().int().positive(),
  otpm: z.number().int().positive(),
})
const overrideBody = z.object({
  opus: familyBudgetSchema.optional(),
  sonnet: familyBudgetSchema.optional(),
  haiku: familyBudgetSchema.optional(),
})

upstreamKeysRoutes.get('/:id/quota-override', async (c) => {
  const override = await quotaConfig.getOverride(c.req.param('id'))
  return c.json({ override })
})

upstreamKeysRoutes.put('/:id/quota-override', zValidator('json', overrideBody), async (c) => {
  const id = c.req.param('id')
  const override = c.req.valid('json')
  await quotaConfig.setOverride(id, override)
  await audit.record({
    actor: c.get('user'),
    action: 'admin.upstream_key.quota_override',
    target: id,
    metadata: { override },
  })
  return c.json({ ok: true })
})

// Global defaults — applied when a key has no per-key override. GET returns
// what's currently in force (merged with Anthropic Active-tier fallbacks).
upstreamKeysRoutes.get('/quota-defaults', async (c) => {
  return c.json({ defaults: await quotaConfig.getDefaults() })
})

const defaultsBody = z.object({
  opus: familyBudgetSchema,
  sonnet: familyBudgetSchema,
  haiku: familyBudgetSchema,
})

upstreamKeysRoutes.put('/quota-defaults', zValidator('json', defaultsBody), async (c) => {
  const defaults = c.req.valid('json')
  await quotaConfig.setDefaults(defaults)
  await audit.record({
    actor: c.get('user'),
    action: 'admin.upstream_key.quota_defaults',
    metadata: { defaults },
  })
  return c.json({ ok: true })
})

upstreamKeysRoutes.post('/', zValidator('json', z.object({
  alias: z.string().min(1),
  secret: z.string().min(10),
  priority: z.number().int().optional(),
  quota_hint_usd: z.string().optional(),
  base_url: z.string().url().optional(),
})), async (c) => {
  const b = c.req.valid('json')
  const row = await svc.create({ alias: b.alias, secret: b.secret, priority: b.priority, quotaHintUsd: b.quota_hint_usd, baseUrl: b.base_url })
  // Never log the secret itself — only the prefix svc.create stored.
  await audit.record({
    actor: c.get('user'),
    action: 'admin.upstream_key.create',
    target: row.alias,
    metadata: { id: row.id, key_prefix: row.keyPrefix, priority: row.priority, base_url: row.baseUrl },
  })
  return c.json(svc.toPublic(row), 201)
})

upstreamKeysRoutes.patch('/:id', zValidator('json', z.object({
  alias: z.string().optional(),
  state: z.enum(['active', 'cooldown', 'disabled']).optional(),
  priority: z.number().int().optional(),
})), async (c) => {
  const id = c.req.param('id')
  const patch = c.req.valid('json')
  const row = await svc.patch(id, patch)
  await audit.record({
    actor: c.get('user'),
    action: 'admin.upstream_key.update',
    target: row.alias,
    metadata: { id, patch },
  })
  return c.json(svc.toPublic(row))
})

upstreamKeysRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  // Capture alias before delete so the audit row has a useful target.
  const before = (await svc.list()).find((r) => r.id === id)
  await svc.remove(id)
  await audit.record({
    actor: c.get('user'),
    action: 'admin.upstream_key.delete',
    target: before?.alias ?? id,
    metadata: { id, alias: before?.alias, key_prefix: before?.keyPrefix },
  })
  return c.json({ ok: true })
})
