// backend/src/services/models.ts
import { eq, desc } from 'drizzle-orm'
import { db } from '../db/client.js'
import { models } from '../db/schema.js'
import { getAnthropicBaseUrl } from '../env.js'
import { AppError } from '../shared/errors.js'

export type ModelRow = typeof models.$inferSelect

export async function list({ enabledOnly }: { enabledOnly: boolean }) {
  // Recommended on top, then newest first. Descending by id lines up with
  // version suffixes (claude-opus-4-7 > 4-6 > 4-5 > 4-1 > 4).
  const rows = await db.select().from(models)
    .orderBy(desc(models.recommended), desc(models.id))
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
    | 'contextWindow'
    | 'inputPriceUsdPerMtok' | 'outputPriceUsdPerMtok'
    | 'cacheReadPriceUsdPerMtok' | 'cacheWritePriceUsdPerMtok'
    | 'cacheWrite1hPriceUsdPerMtok'
  >>,
) {
  const [row] = await db.update(models).set(p).where(eq(models.id, id)).returning()
  if (!row) throw new AppError('not_found')
  return row
}

export async function remove(id: string) {
  await db.delete(models).where(eq(models.id, id))
}

// SDK v0.30 does not expose client.models.list(); use direct fetch instead.
export async function sync(upstreamApiKey: string): Promise<{ added: string[]; updated: string[] }> {
  const res = await fetch(`${getAnthropicBaseUrl()}/v1/models?limit=100`, {
    headers: {
      'x-api-key': upstreamApiKey,
      'authorization': `Bearer ${upstreamApiKey}`,
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
