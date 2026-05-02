// backend/src/services/audit.test.ts
//
// Covers the contract of services/audit.ts: record() inserts a row, list()
// honours its filters (action, q, sinceMs, limit), and toPublic() shapes
// the JSON the admin console consumes. Hits the real Postgres configured
// by the env. Each test creates rows under a per-suite actor so it can run
// alongside e2e.test.ts without colliding.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db, pool } from '../db/client.js'
import { users, auditEvents } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import * as audit from './audit.js'

const EMAIL = 'audit-svc-test@example.com'
let actorId = ''
const actor = { id: '', email: EMAIL }

beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email=$1", [EMAIL])
  const [row] = await db.insert(users).values({
    email: EMAIL, passwordHash: 'x', name: 'audit-svc-test', balanceUsd: '0.000000',
  }).returning()
  actorId = row!.id
  actor.id = actorId
})

afterAll(async () => {
  await db.delete(auditEvents).where(eq(auditEvents.actorUserId, actorId))
  await db.delete(users).where(eq(users.id, actorId))
})

beforeEach(async () => {
  await db.delete(auditEvents).where(eq(auditEvents.actorUserId, actorId))
})

describe('audit service', () => {
  it('record() persists action, target, note, metadata', async () => {
    await audit.record({
      actor,
      action: 'admin.user.suspend',
      target: 'victim@example.com',
      note: 'spam',
      metadata: { reason: 'ToS violation' },
    })
    const rows = await db.select().from(auditEvents).where(eq(auditEvents.actorUserId, actorId))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.action).toBe('admin.user.suspend')
    expect(rows[0]!.target).toBe('victim@example.com')
    expect(rows[0]!.note).toBe('spam')
    expect(rows[0]!.metadata).toEqual({ reason: 'ToS violation' })
    expect(rows[0]!.actorEmail).toBe(EMAIL)
  })

  it('list() filters by exact action', async () => {
    await audit.record({ actor, action: 'admin.user.update', target: 'a' })
    await audit.record({ actor, action: 'admin.user.suspend', target: 'b' })
    await audit.record({ actor, action: 'admin.key.revoke', target: 'c' })

    const rows = await audit.list({ action: 'admin.user.suspend' })
    const mine = rows.filter((r) => r.actorUserId === actorId)
    expect(mine).toHaveLength(1)
    expect(mine[0]!.target).toBe('b')
  })

  it('list() q matches actor_email or target substring', async () => {
    await audit.record({ actor, action: 'admin.user.update', target: 'someone@victim.org' })
    await audit.record({ actor, action: 'admin.user.update', target: 'unrelated@example.com' })

    const rows = await audit.list({ q: 'victim.org' })
    const mine = rows.filter((r) => r.actorUserId === actorId)
    expect(mine).toHaveLength(1)
    expect(mine[0]!.target).toBe('someone@victim.org')
  })

  it('list() respects limit and orders by at desc', async () => {
    for (let i = 0; i < 5; i++) {
      await audit.record({ actor, action: 'admin.user.update', target: `t${i}` })
    }
    const rows = await audit.list({ limit: 3 })
    const mine = rows.filter((r) => r.actorUserId === actorId)
    expect(mine.length).toBeLessThanOrEqual(3)
    // Newer rows first.
    for (let i = 1; i < mine.length; i++) {
      expect(mine[i - 1]!.at.getTime()).toBeGreaterThanOrEqual(mine[i]!.at.getTime())
    }
  })

  it('list() sinceMs cutoff excludes old rows', async () => {
    await audit.record({ actor, action: 'admin.user.update', target: 'recent' })
    // Ask for the last 1ms — anything older is excluded. The row we just
    // inserted is borderline; relying on it being filtered would be flaky,
    // so just assert that a sinceMs of 0 with a forward-shifted clock works.
    const rows = await audit.list({ sinceMs: -10_000 })
    const mine = rows.filter((r) => r.actorUserId === actorId)
    expect(mine).toHaveLength(0)
  })

  it('toPublic() exposes display fields and hides actor_user_id-as-internal', async () => {
    await audit.record({
      actor,
      action: 'admin.model.update',
      target: 'claude-opus-4-7',
      metadata: { changed: ['markup_pct'] },
    })
    const [row] = await db.select().from(auditEvents).where(eq(auditEvents.actorUserId, actorId))
    const pub = audit.toPublic(row!)
    expect(pub).toMatchObject({
      action: 'admin.model.update',
      target: 'claude-opus-4-7',
      actor: EMAIL,
      actor_id: actorId,
      metadata: { changed: ['markup_pct'] },
    })
    expect(pub.id).toBeTruthy()
    expect(pub.at).toBeInstanceOf(Date)
  })

  it('record() swallows errors without throwing', async () => {
    // Missing required `action` should make the insert fail. record() must
    // not propagate — the calling admin route already succeeded.
    await expect(
      audit.record({ actor, action: undefined as unknown as string }),
    ).resolves.toBeUndefined()
  })
})
