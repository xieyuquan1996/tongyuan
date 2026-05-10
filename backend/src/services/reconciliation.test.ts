// src/services/reconciliation.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { diffPct, calcStatus, computeLocalUsage } from './reconciliation.js'
import * as svc from './reconciliation.js'
import { db } from '../db/client.js'
import { requestLogs, upstreamKeys, users, apiKeys, reconciliationReports } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { hashPassword } from '../crypto/password.js'
import { encryptSecret } from '../crypto/kms.js'
import { env } from '../env.js'

describe('diffPct', () => {
  it('returns 0 when both are 0', () => {
    expect(diffPct(0, 0)).toBe(0)
  })
  it('returns null when anthropic=0 but local>0', () => {
    expect(diffPct(100, 0)).toBeNull()
  })
  it('returns positive pct when local > anthropic', () => {
    expect(diffPct(110, 100)).toBeCloseTo(10)
  })
  it('returns negative pct when local < anthropic', () => {
    expect(diffPct(90, 100)).toBeCloseTo(-10)
  })
})

describe('calcStatus', () => {
  it('match when all diffs < 0.1', () => {
    expect(calcStatus(0.05, 0.05, null)).toBe('match')
  })
  it('warn when any diff between 0.1 and 1', () => {
    expect(calcStatus(0.5, 0, null)).toBe('warn')
  })
  it('mismatch when any diff >= 1', () => {
    expect(calcStatus(1.5, 0, null)).toBe('mismatch')
  })
  it('ignores null diffs', () => {
    expect(calcStatus(null, null, null)).toBe('match')
  })
})

// ── CT: Component Tests (real DB) ───────────────────────────────────────────

let testUpstreamKeyId: string
let testUserId: string
let testApiKeyId: string

beforeAll(async () => {
  const ts = Date.now()
  const [u] = await db.insert(users).values({
    email: `reconcile-ct-${ts}@test.com`,
    passwordHash: await hashPassword('x'),
    name: 'ct',
    balanceUsd: '0',
  }).returning()
  testUserId = u!.id

  // Need a real apiKey row to satisfy FK on request_logs.api_key_id
  const [ak] = await db.insert(apiKeys).values({
    userId: testUserId,
    name: 'ct-api-key',
    prefix: 'sk-ct',
    state: 'active',
  }).returning()
  testApiKeyId = ak!.id

  const [k] = await db.insert(upstreamKeys).values({
    alias: 'ct-key',
    keyCiphertext: 'dummy',
    keyPrefix: 'sk-ant-test',
    state: 'active',
    priority: '100',
    weight: 100,
  }).returning()
  testUpstreamKeyId = k!.id

  await db.insert(requestLogs).values([
    {
      id: `req_ct_rec_1_${ts}`,
      userId: testUserId,
      apiKeyId: testApiKeyId,
      upstreamKeyId: testUpstreamKeyId,
      model: 'claude-sonnet-4-6',
      upstreamModel: 'claude-sonnet-4-6',
      endpoint: '/v1/messages',
      stream: false,
      status: '200',
      latencyMs: '100',
      inputTokens: '1000',
      outputTokens: '500',
      cacheReadTokens: '200',
      cacheWriteTokens: '100',
      cacheWrite1hTokens: '0',
      costUsd: '0.01',
      requestHash: `h1_${ts}`,
      upstreamRequestHash: `uh1_${ts}`,
      auditMatch: true,
      createdAt: new Date('2026-05-01T10:00:00Z'),
    },
    {
      id: `req_ct_rec_2_${ts}`,
      userId: testUserId,
      apiKeyId: testApiKeyId,
      upstreamKeyId: testUpstreamKeyId,
      model: 'claude-sonnet-4-6',
      upstreamModel: 'claude-sonnet-4-6',
      endpoint: '/v1/messages',
      stream: false,
      status: '200',
      latencyMs: '100',
      inputTokens: '2000',
      outputTokens: '1000',
      cacheReadTokens: '0',
      cacheWriteTokens: '0',
      cacheWrite1hTokens: '0',
      costUsd: '0.02',
      requestHash: `h2_${ts}`,
      upstreamRequestHash: `uh2_${ts}`,
      auditMatch: true,
      createdAt: new Date('2026-05-01T22:00:00Z'),
    },
  ])
})

afterAll(async () => {
  await db.delete(reconciliationReports).where(eq(reconciliationReports.upstreamKeyId, testUpstreamKeyId))
  await db.delete(requestLogs).where(eq(requestLogs.upstreamKeyId, testUpstreamKeyId))
  await db.delete(upstreamKeys).where(eq(upstreamKeys.id, testUpstreamKeyId))
  await db.delete(apiKeys).where(eq(apiKeys.id, testApiKeyId))
  await db.delete(users).where(eq(users.id, testUserId))
})

describe('computeLocalUsage', () => {
  it('aggregates tokens by day', async () => {
    const result = await computeLocalUsage(
      testUpstreamKeyId,
      new Date('2026-05-01T00:00:00Z'),
      new Date('2026-05-02T00:00:00Z'),
      '1d'
    )
    expect(result.size).toBe(1)
    const bucket = result.get('2026-05-01T00:00:00.000Z')
    expect(bucket).toBeDefined()
    expect(bucket!.inputTokens).toBe(3000)
    expect(bucket!.outputTokens).toBe(1500)
    expect(bucket!.cacheReadTokens).toBe(200)
    expect(bucket!.cacheWriteTokens).toBe(100)
  })

  it('aggregates tokens by hour', async () => {
    const result = await computeLocalUsage(
      testUpstreamKeyId,
      new Date('2026-05-01T00:00:00Z'),
      new Date('2026-05-02T00:00:00Z'),
      '1h'
    )
    expect(result.size).toBe(2)
    const bucket10 = result.get('2026-05-01T10:00:00.000Z')
    expect(bucket10!.inputTokens).toBe(1000)
    const bucket22 = result.get('2026-05-01T22:00:00.000Z')
    expect(bucket22!.inputTokens).toBe(2000)
  })
})

describe('runReconciliation', () => {
  it('writes match report when tokens agree', async () => {
    const adminKey = 'sk-ant-admin-test'
    const anthropicKeyId = 'apikey_01test'
    const ct = encryptSecret(adminKey, env.UPSTREAM_KEY_KMS)
    await db.update(upstreamKeys)
      .set({ adminKeyCiphertext: ct, anthropicKeyId })
      .where(eq(upstreamKeys.id, testUpstreamKeyId))

    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Map([['2026-05-01T00:00:00.000Z', {
        inputTokens: 3000, outputTokens: 1500,
        cacheReadTokens: 200, cacheWriteTokens: 100,
      }]])
    )

    await svc.runReconciliation(
      testUpstreamKeyId,
      new Date('2026-05-01T00:00:00Z'),
      new Date('2026-05-02T00:00:00Z'),
      '1d',
      mockFetch
    )

    const [report] = await db.select()
      .from(reconciliationReports)
      .where(eq(reconciliationReports.upstreamKeyId, testUpstreamKeyId))
    expect(report).toBeDefined()
    expect(report!.status).toBe('match')
    expect(Number(report!.inputDiffPct)).toBeCloseTo(0)
  })

  it('overwrites existing report on re-run (UPSERT)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Map([['2026-05-01T00:00:00.000Z', {
        inputTokens: 6000, outputTokens: 1500,
        cacheReadTokens: 200, cacheWriteTokens: 100,
      }]])
    )

    await svc.runReconciliation(
      testUpstreamKeyId,
      new Date('2026-05-01T00:00:00Z'),
      new Date('2026-05-02T00:00:00Z'),
      '1d',
      mockFetch
    )

    const reports = await db.select()
      .from(reconciliationReports)
      .where(eq(reconciliationReports.upstreamKeyId, testUpstreamKeyId))
    expect(reports.length).toBe(1)
    expect(reports[0]!.status).toBe('mismatch')
  })
})
