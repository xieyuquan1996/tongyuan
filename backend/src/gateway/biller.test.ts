// backend/src/gateway/biller.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db, pool } from '../db/client.js'
import { users, apiKeys } from '../db/schema.js'
import { commitRequest, holdBalance } from './biller.js'
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
      balanceHoldUsd: '0',
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
      balanceHoldUsd: '0',
    })
    const [u] = await db.select().from(users).where(eq(users.id, userId))
    expect(u!.balanceUsd).toBe('9.500000')
  })
})

// ---- holdBalance ----

describe('holdBalance', () => {
  let userId: string

  beforeEach(async () => {
    await pool.query("DELETE FROM users WHERE email='biller-hold@example.com'")
    const [u] = await db.insert(users).values({
      email: 'biller-hold@example.com',
      passwordHash: 'x', name: 't', balanceUsd: '1.000000',
    }).returning()
    userId = u!.id
  })

  // C1
  it('C1: deducts hold from balance', async () => {
    await holdBalance(userId, '0.400000')
    const [u] = await db.select().from(users).where(eq(users.id, userId))
    expect(u!.balanceUsd).toBe('0.600000')
  })

  // C2
  it('C2: throws insufficient_balance when hold exceeds balance', async () => {
    await expect(holdBalance(userId, '2.000000')).rejects.toThrow('insufficient_balance')
    const [u] = await db.select().from(users).where(eq(users.id, userId))
    expect(u!.balanceUsd).toBe('1.000000')
  })

  // C3
  it('C3: second hold fails when balance is drained', async () => {
    await holdBalance(userId, '0.700000')
    await expect(holdBalance(userId, '0.400000')).rejects.toThrow('insufficient_balance')
    const [u] = await db.select().from(users).where(eq(users.id, userId))
    expect(u!.balanceUsd).toBe('0.300000')
  })
})

// ---- commitRequest with hold ----

describe('commitRequest with hold', () => {
  let userId: string
  let apiKeyId: string

  beforeEach(async () => {
    await pool.query("DELETE FROM users WHERE email='biller-commit-hold@example.com'")
    // 余额已被 hold 预扣过：balance = 原始余额 - hold = 0.4
    const [u] = await db.insert(users).values({
      email: 'biller-commit-hold@example.com',
      passwordHash: 'x', name: 't', balanceUsd: '0.400000',
    }).returning()
    userId = u!.id
    const [k] = await db.insert(apiKeys).values({
      userId, name: 'k', prefix: 'sk-relay-HHHHHH', secretHash: 'x',
    }).returning()
    apiKeyId = k!.id
  })

  // C4: actual < hold → 退回差额
  it('C4: refunds excess hold when actual < hold', async () => {
    await commitRequest({
      id: 'req_hold_c4_' + Date.now(),
      userId, apiKeyId, upstreamKeyId: null,
      model: 'claude-opus-4-7', upstreamModel: 'claude-opus-4-7',
      endpoint: '/v1/messages', stream: false, status: 200,
      errorCode: null, latencyMs: 100, ttfbMs: null,
      inputTokens: 100, outputTokens: 50,
      cacheReadTokens: 0, cacheWriteTokens: 0, cacheWrite1hTokens: 0,
      chargeUsd: '0.100000', costUsd: '0.100000',
      requestHash: 'c4', upstreamRequestHash: 'c4', auditMatch: true,
      idempotencyKey: null,
      balanceHoldUsd: '0.400000',  // hold=0.4, actual=0.1 → refund 0.3 → balance=0.4+0.3=0.7
    })
    const [u] = await db.select().from(users).where(eq(users.id, userId))
    expect(u!.balanceUsd).toBe('0.700000')
  })

  // C5: actual > hold → 额外扣减
  it('C5: deducts extra when actual > hold', async () => {
    await commitRequest({
      id: 'req_hold_c5_' + Date.now(),
      userId, apiKeyId, upstreamKeyId: null,
      model: 'claude-opus-4-7', upstreamModel: 'claude-opus-4-7',
      endpoint: '/v1/messages', stream: false, status: 200,
      errorCode: null, latencyMs: 100, ttfbMs: null,
      inputTokens: 500, outputTokens: 1000,
      cacheReadTokens: 0, cacheWriteTokens: 0, cacheWrite1hTokens: 0,
      chargeUsd: '0.500000', costUsd: '0.500000',
      requestHash: 'c5', upstreamRequestHash: 'c5', auditMatch: true,
      idempotencyKey: null,
      balanceHoldUsd: '0.400000',  // hold=0.4, actual=0.5 → extra -0.1 → balance=0.4-0.1=0.3
    })
    const [u] = await db.select().from(users).where(eq(users.id, userId))
    expect(u!.balanceUsd).toBe('0.300000')
  })

  // C6: actual = 0（出错）→ 全额退还 hold
  it('C6: refunds full hold on error (chargeUsd=0)', async () => {
    await commitRequest({
      id: 'req_hold_c6_' + Date.now(),
      userId, apiKeyId, upstreamKeyId: null,
      model: 'claude-opus-4-7', upstreamModel: 'claude-opus-4-7',
      endpoint: '/v1/messages', stream: false, status: 502,
      errorCode: 'upstream_error', latencyMs: 50, ttfbMs: null,
      inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheWriteTokens: 0, cacheWrite1hTokens: 0,
      chargeUsd: '0.000000', costUsd: '0.000000',
      requestHash: 'c6', upstreamRequestHash: 'c6', auditMatch: true,
      idempotencyKey: null,
      balanceHoldUsd: '0.400000',  // hold=0.4, actual=0 → refund 0.4 → balance=0.4+0.4=0.8
    })
    const [u] = await db.select().from(users).where(eq(users.id, userId))
    expect(u!.balanceUsd).toBe('0.800000')
  })

  // C7: hold=0 → 旧行为不变
  it('C7: hold=0 falls back to legacy debit behavior', async () => {
    await commitRequest({
      id: 'req_hold_c7_' + Date.now(),
      userId, apiKeyId, upstreamKeyId: null,
      model: 'claude-opus-4-7', upstreamModel: 'claude-opus-4-7',
      endpoint: '/v1/messages', stream: false, status: 200,
      errorCode: null, latencyMs: 100, ttfbMs: null,
      inputTokens: 100, outputTokens: 50,
      cacheReadTokens: 0, cacheWriteTokens: 0, cacheWrite1hTokens: 0,
      chargeUsd: '0.100000', costUsd: '0.100000',
      requestHash: 'c7', upstreamRequestHash: 'c7', auditMatch: true,
      idempotencyKey: null,
      balanceHoldUsd: '0',  // 无 hold → 直接扣 → balance=0.4-0.1=0.3
    })
    const [u] = await db.select().from(users).where(eq(users.id, userId))
    expect(u!.balanceUsd).toBe('0.300000')
  })
})
