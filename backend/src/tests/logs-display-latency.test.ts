// backend/src/tests/logs-display-latency.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../app.js'
import { db, pool } from '../db/client.js'
import { users, requestLogs, apiKeys } from '../db/schema.js'
import { issueSession } from '../services/sessions.js'
import { hashPassword } from '../crypto/password.js'
import { newApiKey } from '../crypto/tokens.js'
import { ulid } from 'ulid'
import bcrypt from 'bcryptjs'

const app = createApp()
const EMAIL = 'logs-display-latency-test@example.com'
const ADMIN_EMAIL = 'logs-display-latency-admin@example.com'
let userId = ''
let adminId = ''
let apiKeyId = ''
let token = ''
let adminToken = ''

beforeAll(async () => {
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [[EMAIL, ADMIN_EMAIL]])

  const [u] = await db.insert(users).values({
    email: EMAIL,
    passwordHash: await hashPassword('secret'),
    name: 'test',
    balanceUsd: '10',
  }).returning()
  userId = u!.id
  const { token: t } = await issueSession(userId)
  token = t

  const { secret, prefix } = newApiKey()
  const [k] = await db.insert(apiKeys).values({
    userId,
    name: 'test-key',
    prefix,
    secretHash: await bcrypt.hash(secret, 12),
    state: 'active',
  }).returning()
  apiKeyId = k!.id

  const [a] = await db.insert(users).values({
    email: ADMIN_EMAIL,
    passwordHash: await hashPassword('secret'),
    name: 'admin',
    role: 'admin',
    balanceUsd: '0',
  }).returning()
  adminId = a!.id
  const { token: at } = await issueSession(adminId)
  adminToken = at
})

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [[EMAIL, ADMIN_EMAIL]])
})

async function insertLog(opts: {
  userId: string
  stream: boolean
  latencyMs: string
  ttfbMs: string | null
}) {
  const [row] = await db.insert(requestLogs).values({
    id: 'req_' + ulid(),
    userId: opts.userId,
    apiKeyId,
    model: 'claude-3-5-haiku-20241022',
    upstreamModel: 'claude-3-5-haiku-20241022',
    endpoint: '/v1/messages',
    status: '200',
    stream: opts.stream,
    inputTokens: '10',
    outputTokens: '5',
    cacheReadTokens: '0',
    cacheWriteTokens: '0',
    cacheWrite1hTokens: '0',
    costUsd: '0.0001',
    latencyMs: opts.latencyMs,
    ttfbMs: opts.ttfbMs,
    requestHash: 'hash-' + Math.random().toString(36).slice(2),
    upstreamRequestHash: 'uhash-' + Math.random().toString(36).slice(2),
    idempotencyKey: null,
    auditMatch: true,
  }).returning()
  return row!
}

describe('GET /api/console/logs — display_latency_ms', () => {
  it('streaming: display_latency_ms equals ttfb_ms', async () => {
    await insertLog({ userId, stream: true, latencyMs: '5000', ttfbMs: '300' })

    const res = await app.fetch(
      new Request('http://localhost/api/console/logs', { headers: { Authorization: `Bearer ${token}` } }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as any
    const log = body.logs[0]
    expect(log.display_latency_ms).toBe(300)
    expect(log).not.toHaveProperty('latency_ms')
    expect(log).not.toHaveProperty('ttfb_ms')
  })

  it('non-streaming: display_latency_ms equals latency_ms', async () => {
    await pool.query('DELETE FROM request_logs WHERE user_id=$1', [userId])
    await insertLog({ userId, stream: false, latencyMs: '800', ttfbMs: null })

    const res = await app.fetch(
      new Request('http://localhost/api/console/logs', { headers: { Authorization: `Bearer ${token}` } }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as any
    const log = body.logs[0]
    expect(log.display_latency_ms).toBe(800)
    expect(log).not.toHaveProperty('latency_ms')
  })
})

describe('GET /api/console/logs/:id — display_latency_ms', () => {
  it('streaming detail: display_latency_ms equals ttfb_ms', async () => {
    await pool.query('DELETE FROM request_logs WHERE user_id=$1', [userId])
    const inserted = await insertLog({ userId, stream: true, latencyMs: '9000', ttfbMs: '400' })

    const res = await app.fetch(
      new Request(`http://localhost/api/console/logs/${inserted.id}`, { headers: { Authorization: `Bearer ${token}` } }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.log.display_latency_ms).toBe(400)
    expect(body.log).not.toHaveProperty('latency_ms')
  })
})

describe('GET /api/admin/logs — ttfb_ms + display_latency_ms', () => {
  it('streaming: exposes ttfb_ms and display_latency_ms', async () => {
    await pool.query('DELETE FROM request_logs WHERE user_id=$1', [userId])
    await insertLog({ userId, stream: true, latencyMs: '5000', ttfbMs: '250' })

    const res = await app.fetch(
      new Request('http://localhost/api/admin/logs', { headers: { Authorization: `Bearer ${adminToken}` } }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as any
    const log = body.logs.find((l: any) => l.user_email === EMAIL)
    expect(log.ttfb_ms).toBe(250)
    expect(log.display_latency_ms).toBe(250)
    expect(log.latency_ms).toBe(5000)
  })

  it('non-streaming: ttfb_ms is null, display_latency_ms equals latency_ms', async () => {
    await pool.query('DELETE FROM request_logs WHERE user_id=$1', [userId])
    await insertLog({ userId, stream: false, latencyMs: '700', ttfbMs: null })

    const res = await app.fetch(
      new Request('http://localhost/api/admin/logs', { headers: { Authorization: `Bearer ${adminToken}` } }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as any
    const log = body.logs.find((l: any) => l.user_email === EMAIL)
    expect(log.ttfb_ms).toBeNull()
    expect(log.display_latency_ms).toBe(700)
    expect(log.latency_ms).toBe(700)
  })
})

describe('GET /api/admin/users/:id — recent_logs ttfb_ms + display_latency_ms', () => {
  it('streaming: recent_logs has ttfb_ms and display_latency_ms', async () => {
    await pool.query('DELETE FROM request_logs WHERE user_id=$1', [userId])
    await insertLog({ userId, stream: true, latencyMs: '6000', ttfbMs: '500' })

    const res = await app.fetch(
      new Request(`http://localhost/api/admin/users/${userId}`, { headers: { Authorization: `Bearer ${adminToken}` } }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as any
    const log = body.recent_logs[0]
    expect(log.ttfb_ms).toBe(500)
    expect(log.display_latency_ms).toBe(500)
    expect(log.latency_ms).toBe(6000)
  })
})
