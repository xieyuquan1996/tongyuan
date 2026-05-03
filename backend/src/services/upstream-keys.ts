// backend/src/services/upstream-keys.ts
import { eq, and, asc, desc, lt } from 'drizzle-orm'
import { db } from '../db/client.js'
import { upstreamKeys } from '../db/schema.js'
import { encryptSecret, decryptSecret } from '../crypto/kms.js'
import { env } from '../env.js'
import { AppError } from '../shared/errors.js'

export type UpstreamRow = typeof upstreamKeys.$inferSelect
export type UpstreamPublic = Omit<UpstreamRow, 'keyCiphertext'>

export function toPublic(row: UpstreamRow): UpstreamPublic {
  const { keyCiphertext: _omit, ...rest } = row
  return rest
}

export async function create(input: { alias: string; secret: string; priority?: number; weight?: number; quotaHintUsd?: string; baseUrl?: string }) {
  // Strip accidental whitespace / BOM from pasted keys — Anthropic returns 401
  // if x-api-key has any stray chars, and we've been bitten by this repeatedly.
  const secret = input.secret.trim().replace(/​|﻿/g, '')
  if (!secret) throw new AppError('missing_fields')
  const ct = encryptSecret(secret, env.UPSTREAM_KEY_KMS)
  const prefix = secret.slice(0, 20)
  const [row] = await db.insert(upstreamKeys).values({
    alias: input.alias,
    keyCiphertext: ct,
    keyPrefix: prefix,
    priority: String(input.priority ?? 100),
    weight: input.weight ?? 100,
    quotaHintUsd: input.quotaHintUsd,
    baseUrl: input.baseUrl || null,
  }).returning()
  return row!
}

export async function list() {
  return db.select().from(upstreamKeys).orderBy(asc(upstreamKeys.priority), desc(upstreamKeys.createdAt))
}

export async function patch(id: string, p: { alias?: string; state?: 'active' | 'cooldown' | 'disabled'; priority?: number; weight?: number }) {
  const [row] = await db.update(upstreamKeys).set({
    ...(p.alias !== undefined ? { alias: p.alias } : {}),
    ...(p.state !== undefined ? { state: p.state } : {}),
    ...(p.priority !== undefined ? { priority: String(p.priority) } : {}),
    ...(p.weight !== undefined ? { weight: p.weight } : {}),
  }).where(eq(upstreamKeys.id, id)).returning()
  if (!row) throw new AppError('not_found')
  return row
}

export async function remove(id: string) {
  await db.delete(upstreamKeys).where(eq(upstreamKeys.id, id))
}

export async function decrypt(row: UpstreamRow): Promise<string> {
  // Trim retroactively so any historical key stored with stray whitespace
  // stops producing 401s without forcing the admin to re-add it.
  return decryptSecret(row.keyCiphertext, env.UPSTREAM_KEY_KMS).trim().replace(/​|﻿/g, '')
}

export async function markCooldown(id: string, ms: number, errorCode: string) {
  const until = new Date(Date.now() + ms)
  await db.update(upstreamKeys).set({
    state: 'cooldown',
    cooldownUntil: until,
    lastErrorCode: errorCode,
    lastErrorAt: new Date(),
  }).where(eq(upstreamKeys.id, id))
}

export async function reactivateExpired() {
  await db.update(upstreamKeys)
    .set({ state: 'active', cooldownUntil: null })
    .where(and(eq(upstreamKeys.state, 'cooldown'), lt(upstreamKeys.cooldownUntil, new Date())))
}

export async function pickActive(): Promise<UpstreamRow[]> {
  await reactivateExpired()
  return db.select().from(upstreamKeys)
    .where(eq(upstreamKeys.state, 'active'))
    .orderBy(asc(upstreamKeys.priority), asc(upstreamKeys.createdAt))
}
