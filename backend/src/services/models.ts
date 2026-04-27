// backend/src/services/models.ts
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { models } from '../db/schema.js'
import { env } from '../env.js'
import { AppError } from '../shared/errors.js'

export type ModelRow = typeof models.$inferSelect

export async function list({ enabledOnly }: { enabledOnly: boolean }) {
  const rows = await db.select().from(models)
  return enabledOnly ? rows.filter((r) => r.enabled) : rows
}

export async function getById(id: string) {
  const row = await db.query.models.findFirst({ where: eq(models.id, id) })
  if (!row) throw new AppError('unknown_model')
  return row
}

export async function patch(
  id: string,
  p: Partial<Pick<ModelRow,
    | 'displayName' | 'markupPct' | 'enabled' | 'recommended' | 'note'
    | 'inputPriceUsdPerMtok' | 'outputPriceUsdPerMtok'
    | 'cacheReadPriceUsdPerMtok' | 'cacheWritePriceUsdPerMtok'
  >>,
) {
  const [row] = await db.update(models).set(p).where(eq(models.id, id)).returning()
  if (!row) throw new AppError('not_found')
  return row
}

// SDK v0.30 does not expose client.models.list(); use direct fetch instead.
export async function sync(upstreamApiKey: string): Promise<{ added: string[]; updated: string[] }> {
  const res = await fetch(`${env.ANTHROPIC_UPSTREAM_BASE_URL}/v1/models?limit=100`, {
    headers: {
      'x-api-key': upstreamApiKey,
      'anthropic-version': '2023-06-01',
    },
  })
  if (!res.ok) {
    throw new AppError('upstream_error', `models list returned ${res.status}`)
  }
  const json = await res.json() as { data: Array<{ id: string; display_name?: string }> }
  const added: string[] = []
  const updated: string[] = []
  for (const m of json.data) {
    const existing = await db.query.models.findFirst({ where: eq(models.id, m.id) })
    if (!existing) {
      await db.insert(models).values({
        id: m.id,
        displayName: m.display_name ?? m.id,
        syncedAt: new Date(),
      })
      added.push(m.id)
    } else {
      // Preserve admin's display_name override; only bump syncedAt on re-sync.
      await db.update(models).set({ syncedAt: new Date(), displayName: existing.displayName }).where(eq(models.id, m.id))
      updated.push(m.id)
    }
  }
  return { added, updated }
}
