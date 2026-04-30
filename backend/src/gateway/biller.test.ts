// backend/src/gateway/biller.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db, pool } from '../db/client.js'
import { users, apiKeys } from '../db/schema.js'
import { commitRequest } from './biller.js'
import { eq } from 'drizzle-orm'

describe('commitRequest', () => {
  let userId: string
  let apiKeyId: string

  beforeEach(async () => {
    await pool.query("DELETE FROM users WHERE email='biller-test@example.com'")
    const [u] = await db.insert(users).values({
      email: 'biller-test@example.com',
      passwordHash: 'x', name: 't', balanceUsd: '10.000000',
    }).returning()
    userId = u!.id
    const [k] = await db.insert(apiKeys).values({
      userId, name: 'k', prefix: 'sk-relay-XXXXXXX', secretHash: 'x',
    }).returning()
    apiKeyId = k!.id
  })

  it('zero charge writes log but no ledger row', async () => {
    await commitRequest({
      id: 'req_zero_' + Date.now(),
      userId, apiKeyId, upstreamKeyId: null,
      model: 'claude-opus-4-7', upstreamModel: 'claude-opus-4-7',
      endpoint: '/v1/messages', stream: false, status: 200,
      errorCode: null, latencyMs: 50, ttfbMs: null,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cacheWrite1hTokens: 0,
      chargeUsd: '0.000000', costUsd: '0.000000',
      requestHash: 'a', upstreamRequestHash: 'a', auditMatch: true,
      idempotencyKey: null,
    })
    const [u] = await db.select().from(users).where(eq(users.id, userId))
    expect(u!.balanceUsd).toBe('10.000000')   // unchanged
  })

  it('debits balance and writes log + ledger', async () => {
    await commitRequest({
      id: 'req_01',
      userId, apiKeyId, upstreamKeyId: null,
      model: 'claude-opus-4-7', upstreamModel: 'claude-opus-4-7',
      endpoint: '/v1/messages', stream: false, status: 200,
      errorCode: null, latencyMs: 421, ttfbMs: null,
      inputTokens: 100, outputTokens: 200,
      cacheReadTokens: 0, cacheWriteTokens: 0, cacheWrite1hTokens: 0,
      chargeUsd: '0.500000', costUsd: '0.500000',
      requestHash: 'a', upstreamRequestHash: 'a', auditMatch: true,
      idempotencyKey: null,
    })
    const [u] = await db.select().from(users).where(eq(users.id, userId))
    expect(u!.balanceUsd).toBe('9.500000')
  })
})
