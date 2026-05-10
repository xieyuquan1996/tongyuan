// backend/src/tests/reconciliation.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createApp } from '../app.js'
import { db } from '../db/client.js'
import { users, upstreamKeys, reconciliationReports } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { hashPassword } from '../crypto/password.js'
import { encryptSecret } from '../crypto/kms.js'
import { env } from '../env.js'
import * as reconSvc from '../services/reconciliation.js'

const app = createApp()
let adminToken = ''
let upstreamKeyId = ''
let userId = ''

beforeAll(async () => {
  const [u] = await db.insert(users).values({
    email: `recon-ft-${Date.now()}@test.com`,
    passwordHash: await hashPassword('pass123'),
    name: 'admin',
    role: 'admin',
    balanceUsd: '0',
  }).returning()
  userId = u!.id

  const loginResp = await app.fetch(new Request('http://localhost/api/console/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u!.email, password: 'pass123' }),
  }))
  const loginBody = await loginResp.json() as any
  adminToken = loginBody.session?.token ?? ''

  const ct = encryptSecret('sk-ant-admin-fake', env.UPSTREAM_KEY_KMS)
  const [k] = await db.insert(upstreamKeys).values({
    alias: 'recon-test-key',
    keyCiphertext: encryptSecret('sk-ant-api-fake', env.UPSTREAM_KEY_KMS),
    keyPrefix: 'sk-ant-api-fa',
    adminKeyCiphertext: ct,
    anthropicKeyId: 'apikey_01test',
    state: 'active',
    priority: '100',
    weight: 100,
  }).returning()
  upstreamKeyId = k!.id
})

afterAll(async () => {
  if (upstreamKeyId) {
    await db.delete(reconciliationReports).where(eq(reconciliationReports.upstreamKeyId, upstreamKeyId))
    await db.delete(upstreamKeys).where(eq(upstreamKeys.id, upstreamKeyId))
  }
  if (userId) await db.delete(users).where(eq(users.id, userId))
})

describe('POST /api/admin/reconciliation/run', () => {
  it('rejects non-admin', async () => {
    const resp = await app.fetch(new Request('http://localhost/api/admin/reconciliation/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startAt: '2026-05-01T00:00:00Z', endAt: '2026-05-02T00:00:00Z', bucketWidth: '1d' }),
    }))
    expect(resp.status).toBe(401)
  })

  it('validates 1h cannot exceed 7 days', async () => {
    const resp = await app.fetch(new Request('http://localhost/api/admin/reconciliation/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        startAt: '2026-05-01T00:00:00Z',
        endAt: '2026-05-15T00:00:00Z',
        bucketWidth: '1h',
      }),
    }))
    expect(resp.status).toBe(400)
  })

  it('runs reconciliation with mocked runReconciliation', async () => {
    vi.spyOn(reconSvc, 'runReconciliation').mockResolvedValueOnce([])

    const resp = await app.fetch(new Request('http://localhost/api/admin/reconciliation/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        upstreamKeyIds: [upstreamKeyId],
        startAt: '2026-05-01T00:00:00Z',
        endAt: '2026-05-02T00:00:00Z',
        bucketWidth: '1d',
      }),
    }))
    expect(resp.status).toBe(200)
    const body = await resp.json() as any
    expect(body).toHaveProperty('results')
    vi.restoreAllMocks()
  })
})

describe('GET /api/admin/reconciliation/reports', () => {
  it('returns paginated results', async () => {
    const resp = await app.fetch(new Request(
      `http://localhost/api/admin/reconciliation/reports?upstreamKeyId=${upstreamKeyId}`,
      { headers: { authorization: `Bearer ${adminToken}` } }
    ))
    expect(resp.status).toBe(200)
    const body = await resp.json() as any
    expect(body).toHaveProperty('reports')
    expect(body).toHaveProperty('total')
  })
})
