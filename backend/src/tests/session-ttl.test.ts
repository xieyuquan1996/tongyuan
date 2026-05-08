// backend/src/tests/session-ttl.test.ts
//
// Functional tests for session TTL behaviour via the full HTTP stack.
// Covers: 7-day TTL on login, sliding-window refresh on /me,
// and rejection of expired sessions.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { createApp } from '../app.js'
import { db } from '../db/client.js'
import { sessions, users } from '../db/schema.js'
import { desc, eq } from 'drizzle-orm'
import { hashPassword } from '../crypto/password.js'

const app = createApp()

const EMAIL = `session-ttl-ft-${Date.now()}@example.com`
const PASSWORD = 'hunter2hunter2'
let userId = ''

async function post(path: string, body: unknown, token?: string) {
  return app.fetch(new Request('http://x' + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }))
}

async function get(path: string, token: string) {
  return app.fetch(new Request('http://x' + path, {
    headers: { authorization: `Bearer ${token}` },
  }))
}

async function login() {
  const res = await post('/api/console/login', { email: EMAIL, password: PASSWORD })
  expect(res.status).toBe(200)
  const body = await res.json() as any
  // Fetch the matching session row by finding the most recent one just created
  const row = await db.query.sessions.findFirst({
    where: eq(sessions.userId, userId),
    orderBy: [desc(sessions.createdAt)],
  })
  return { token: body.session.token as string, row: row! }
}

beforeAll(async () => {
  const [u] = await db.insert(users).values({
    email: EMAIL,
    passwordHash: await hashPassword(PASSWORD),
    name: 'session-ttl-ft',
    balanceUsd: '0.000000',
  }).returning()
  userId = u!.id
})

beforeEach(async () => {
  // Each test starts with a clean slate — no stale sessions from prior tests.
  await db.delete(sessions).where(eq(sessions.userId, userId))
})

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId))
})

describe('POST /api/console/login — session TTL', () => {
  it('issues a session that expires in ~7 days, not 30', async () => {
    const res = await post('/api/console/login', { email: EMAIL, password: PASSWORD })
    expect(res.status).toBe(200)

    const body = await res.json() as any
    const expiresAt = new Date(body.session.expires_at).getTime()
    const now = Date.now()

    const sevenDays = 7 * 24 * 3600 * 1000
    const thirtyDays = 30 * 24 * 3600 * 1000

    expect(expiresAt).toBeGreaterThan(now + sevenDays - 60_000)
    expect(expiresAt).toBeLessThan(now + sevenDays + 60_000)
    expect(expiresAt).toBeLessThan(now + thirtyDays)
  })
})

describe('GET /api/console/me — sliding window refresh', () => {
  it('extends session expiresAt when session is within 24h of expiry', async () => {
    const { token, row } = await login()

    // Backdate expiresAt to 1 hour from now (within 24h refresh threshold)
    await db.update(sessions)
      .set({ expiresAt: new Date(Date.now() + 1 * 3600 * 1000) })
      .where(eq(sessions.id, row.id))

    const before = Date.now()
    const meRes = await get('/api/console/me', token)
    expect(meRes.status).toBe(200)

    // Give fire-and-forget touchSession a tick to settle
    await new Promise(r => setTimeout(r, 100))

    const updated = await db.query.sessions.findFirst({ where: eq(sessions.id, row.id) })
    const sevenDays = 7 * 24 * 3600 * 1000
    expect(updated!.expiresAt.getTime()).toBeGreaterThan(before + sevenDays - 60_000)
  })

  it('rejects a session that has already expired', async () => {
    const { token, row } = await login()

    await db.update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, row.id))

    const meRes = await get('/api/console/me', token)
    expect(meRes.status).toBe(401)
  })
})
