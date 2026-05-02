// Admin operation audit trail.
//
// One helper, one read query. Every mutating admin route calls record()
// after its own DB write succeeds; we deliberately do NOT make this part
// of the same transaction — an audit insert failure must not roll back
// the actual operation. (Worst case: a balance adjust succeeds but the
// audit row is missing. Better than refusing to suspend a runaway user
// because the audit table is wedged.) Inserts are best-effort and log
// errors to stderr.
//
// Action naming convention: `admin.<noun>.<verb>` — keep it stable, the
// frontend Audit page maps these to color tones.

import { and, desc, eq, gte, ilike, or, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { auditEvents } from '../db/schema.js'
import type { UserRow } from './users.js'

export type AuditEventRow = typeof auditEvents.$inferSelect

export type RecordInput = {
  actor: Pick<UserRow, 'id' | 'email'>
  action: string
  target?: string | null
  note?: string
  // Free-form structured payload. Diff before/after, ids of related
  // objects, anything the operator might want during forensics. Kept
  // out of the human-readable columns so the listing stays tidy.
  metadata?: Record<string, unknown> | null
}

export async function record(input: RecordInput): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      actorUserId: input.actor.id,
      actorEmail: input.actor.email,
      action: input.action,
      target: input.target ?? null,
      note: input.note ?? '',
      metadata: input.metadata ?? null,
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[audit] insert failed', { action: input.action, target: input.target, err: e })
  }
}

// Fire-and-forget variant for callers that don't want to await. Catches
// rejection so a stray promise can't take down the route's reply path.
export function recordAsync(input: RecordInput): void {
  record(input).catch(() => {})
}

export type ListFilters = {
  action?: string         // exact match — "admin.user.suspend"
  q?: string              // substring on actor_email or target
  sinceMs?: number        // default 30d
  limit?: number          // default 100, hard cap 500
}

export async function list(filters: ListFilters = {}): Promise<AuditEventRow[]> {
  const limit = Math.min(filters.limit ?? 100, 500)
  const since = new Date(Date.now() - (filters.sinceMs ?? 30 * 86_400_000))

  const conds = [gte(auditEvents.at, since)]
  if (filters.action) conds.push(eq(auditEvents.action, filters.action))
  if (filters.q) {
    const like = `%${filters.q}%`
    conds.push(or(
      ilike(auditEvents.actorEmail, like),
      ilike(sql`coalesce(${auditEvents.target}, '')`, like),
    )!)
  }

  return db.select().from(auditEvents)
    .where(and(...conds))
    .orderBy(desc(auditEvents.at))
    .limit(limit)
}

export function toPublic(row: AuditEventRow) {
  return {
    id: row.id,
    at: row.at,
    actor: row.actorEmail,
    actor_id: row.actorUserId,
    action: row.action,
    target: row.target,
    note: row.note,
    metadata: row.metadata,
  }
}
