// backend/src/middleware/auth-bearer.test.ts
//
// Verifies that requireBearer calls touchSession (fire-and-forget) when the
// session is within 24h of expiry, and skips it when expiry is far away.
// Uses a real Postgres + Redis database.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Hono } from 'hono'
import { db, pool } from '../db/client.js'
import { sessions, users } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { issueSession } from '../services/sessions.js'
import * as sessionsSvc from '../services/sessions.js'
import { requireBearer } from './auth-bearer.js'
import { AppError, toErrorBody } from '../shared/errors.js'

const EMAIL = 'auth-bearer-test@example.com'
let userId = ''

async function ensureUser(): Promise<string> {
  await pool.query('DELETE FROM users WHERE email=$1', [EMAIL])
  const [row] = await db.insert(users).values({
    email: EMAIL,
    passwordHash: 'x',
    name: 'auth-bearer-test',
    balanceUsd: '10.000000',
  }).returning()
  return row!.id
}

function mkApp() {
  const app = new Hono()
  app.onError((err, c) => {
    const status = err instanceof AppError ? err.status : 500
    return c.json(toErrorBody(err), status as any)
  })
  app.use('*', requireBearer)
  app.get('/', (c) => c.json({ ok: true }))
  return app
}

beforeAll(async () => {
  userId = await ensureUser()
})

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email=$1', [EMAIL])
})

describe('requireBearer', () => {
  it('calls touchSession when session expires within 24 hours', async () => {
    const { token, session } = await issueSession(userId)

    // Manually set expiresAt to 1 hour from now (within refresh threshold)
    await db.update(sessions)
      .set({ expiresAt: new Date(Date.now() + 1 * 3600 * 1000) })
      .where(eq(sessions.id, session.id))

    const spy = vi.spyOn(sessionsSvc, 'touchSession')

    const app = mkApp()
    const res = await app.fetch(new Request('http://x/', {
      headers: { authorization: `Bearer ${token}` },
    }))

    expect(res.status).toBe(200)
    // Give fire-and-forget a tick to run
    await new Promise(r => setTimeout(r, 50))
    expect(spy).toHaveBeenCalledOnce()
    expect(spy).toHaveBeenCalledWith(session.id, expect.any(Date))

    spy.mockRestore()
  })

  it('does not call touchSession when session has plenty of time remaining', async () => {
    const { token } = await issueSession(userId)
    // issueSession sets expiresAt to 7 days out — well beyond the 24h threshold

    const spy = vi.spyOn(sessionsSvc, 'touchSession')

    const app = mkApp()
    const res = await app.fetch(new Request('http://x/', {
      headers: { authorization: `Bearer ${token}` },
    }))

    expect(res.status).toBe(200)
    await new Promise(r => setTimeout(r, 50))
    expect(spy).not.toHaveBeenCalled()

    spy.mockRestore()
  })

  it('rejects requests with no Authorization header', async () => {
    const app = mkApp()
    const res = await app.fetch(new Request('http://x/'))
    expect(res.status).toBe(401)
  })
})
