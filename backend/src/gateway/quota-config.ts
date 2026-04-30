// Configurable quota budgets.
//
// Defaults match Anthropic's published Active-tier numbers (April 2026), but
// admins override them from the console — different upstream accounts can be
// on Build Tier 1 through Scale, each with different ceilings.
//
// Storage: the `settings` table. Two keys:
//   quota.defaults                 → JSON: Record<Family, FamilyBudget>
//   quota.override:<upstreamId>    → JSON: Partial<Record<Family, FamilyBudget>>
//
// We cache resolved budgets in-process for 30s. This cost-capped read keeps
// the reserve() path off the DB while still picking up setting changes within
// about half a minute.

import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { settings } from '../db/schema.js'
import { DEFAULT_BUDGETS, type Family, type FamilyBudget } from './family.js'

const CACHE_TTL_MS = 30_000

type Cache = { at: number; value: Record<Family, FamilyBudget> }
const overrideCache = new Map<string, Cache>() // key = upstreamId or '__default__'

function isBudget(x: any): x is FamilyBudget {
  return x && typeof x.rpm === 'number' && typeof x.itpmExclCache === 'number' && typeof x.otpm === 'number'
}

function parse(v: string | undefined): Partial<Record<Family, FamilyBudget>> | null {
  if (!v) return null
  try {
    const j = JSON.parse(v)
    const out: Partial<Record<Family, FamilyBudget>> = {}
    for (const fam of ['opus', 'sonnet', 'haiku'] as Family[]) {
      if (isBudget(j[fam])) out[fam] = j[fam]
    }
    return out
  } catch { return null }
}

async function loadSetting(key: string): Promise<string | undefined> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) })
  return row?.value
}

async function loadDefaults(): Promise<Record<Family, FamilyBudget>> {
  const raw = await loadSetting('quota.defaults')
  const parsed = parse(raw)
  return {
    opus: parsed?.opus ?? DEFAULT_BUDGETS.opus,
    sonnet: parsed?.sonnet ?? DEFAULT_BUDGETS.sonnet,
    haiku: parsed?.haiku ?? DEFAULT_BUDGETS.haiku,
  }
}

async function loadOverride(upstreamId: string): Promise<Partial<Record<Family, FamilyBudget>>> {
  const raw = await loadSetting(`quota.override:${upstreamId}`)
  return parse(raw) ?? {}
}

// Resolve the effective budget for an upstream key × family. Per-key override
// wins; falls back to the global default, which itself falls back to the
// hard-coded Anthropic Active-tier numbers if the admin never configured one.
export async function resolveBudget(upstreamId: string, family: Family): Promise<FamilyBudget> {
  const cached = overrideCache.get(upstreamId)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value[family]

  const [defaults, override] = await Promise.all([loadDefaults(), loadOverride(upstreamId)])
  const resolved: Record<Family, FamilyBudget> = {
    opus: override.opus ?? defaults.opus,
    sonnet: override.sonnet ?? defaults.sonnet,
    haiku: override.haiku ?? defaults.haiku,
  }
  overrideCache.set(upstreamId, { at: Date.now(), value: resolved })
  return resolved[family]
}

export async function resolveAllBudgets(upstreamId: string): Promise<Record<Family, FamilyBudget>> {
  await resolveBudget(upstreamId, 'opus') // warm cache
  return overrideCache.get(upstreamId)!.value
}

export async function getDefaults(): Promise<Record<Family, FamilyBudget>> {
  return loadDefaults()
}

export async function getOverride(upstreamId: string): Promise<Partial<Record<Family, FamilyBudget>>> {
  return loadOverride(upstreamId)
}

export async function setDefaults(budgets: Record<Family, FamilyBudget>): Promise<void> {
  await db.insert(settings)
    .values({ key: 'quota.defaults', value: JSON.stringify(budgets) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(budgets), updatedAt: new Date() } })
  invalidateCache()
}

export async function setOverride(upstreamId: string, budgets: Partial<Record<Family, FamilyBudget>>): Promise<void> {
  const key = `quota.override:${upstreamId}`
  const hasAny = budgets.opus || budgets.sonnet || budgets.haiku
  if (!hasAny) {
    await db.delete(settings).where(eq(settings.key, key))
  } else {
    await db.insert(settings)
      .values({ key, value: JSON.stringify(budgets) })
      .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(budgets), updatedAt: new Date() } })
  }
  invalidateCache(upstreamId)
}

export function invalidateCache(upstreamId?: string): void {
  if (upstreamId) overrideCache.delete(upstreamId)
  else overrideCache.clear()
}
