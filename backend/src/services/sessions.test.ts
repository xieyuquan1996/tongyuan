// backend/src/services/sessions.test.ts
//
// Covers session TTL (7 days), sliding-window refresh logic, and the
// absolute 30-day lifetime cap. Hits the real Postgres configured by env.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db, pool } from '../db/client.js'
import { sessions, users } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { issueSession, resolveSession, shouldRefresh, touchSession } from './sessions.js'

const EMAIL = 'sessions-svc-test@example.com'
let userId = ''

async function ensureUser(): Promise<string> {
  await pool.query('DELETE FROM users WHERE email=$1', [EMAIL])
  const [row] = await db.insert(users).values({
    email: EMAIL,
    passwordHash: 'x',
    name: 'sessions-svc-test',
    balanceUsd: '10.000000',
  }).returning()
  return row!.id
}

beforeAll(async () => {
  userId = await ensureUser()
})

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email=$1', [EMAIL])
})

describe('issueSession', () => {
  it('sets expiresAt to 7 days from now', async () => {
    const before = Date.now()
    const { session } = await issueSession(userId)
    const after = Date.now()

    const expectedMs = 7 * 24 * 3600 * 1000
    const expiryMs = session.expiresAt.getTime()

    expect(expiryMs).toBeGreaterThanOrEqual(before + expectedMs)
    expect(expiryMs).toBeLessThanOrEqual(after + expectedMs + 1000)
  })
})

describe('shouldRefresh', () => {
  it('returns true when session expires within 24 hours', () => {
    const soonExpiry = new Date(Date.now() + 23 * 3600 * 1000)
    expect(shouldRefresh(soonExpiry)).toBe(true)
  })

  it('returns false when session has more than 24 hours remaining', () => {
    const laterExpiry = new Date(Date.now() + 25 * 3600 * 1000)
    expect(shouldRefresh(laterExpiry)).toBe(false)
  })

  it('returns true exactly at the 24-hour boundary', () => {
    const boundary = new Date(Date.now() + 24 * 3600 * 1000 - 1)
    expect(shouldRefresh(boundary)).toBe(true)
  })
})

describe('touchSession', () => {
  it('extends expiresAt by 7 days when called', async () => {
    const { session } = await issueSession(userId)
    const before = Date.now()
    await touchSession(session.id, session.createdAt)

    const [updated] = await db.select().from(sessions).where(eq(sessions.id, session.id))
    const expectedMs = 7 * 24 * 3600 * 1000
    expect(updated!.expiresAt.getTime()).toBeGreaterThanOrEqual(before + expectedMs)
  })

  it('caps expiresAt at 30 days from original createdAt', async () => {
    const { session } = await issueSession(userId)

    // Backdate createdAt to 29 days ago so the new expiry would exceed the cap
    const createdAt = new Date(Date.now() - 29 * 24 * 3600 * 1000)
    await touchSession(session.id, createdAt)

    const [updated] = await db.select().from(sessions).where(eq(sessions.id, session.id))
    const absoluteMax = createdAt.getTime() + 30 * 24 * 3600 * 1000
    expect(updated!.expiresAt.getTime()).toBeLessThanOrEqual(absoluteMax + 1000)
  })
})
