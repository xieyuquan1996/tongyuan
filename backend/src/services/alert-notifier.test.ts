import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { db, pool } from '../db/client.js'
import { users, alerts } from '../db/schema.js'
import { redis } from '../redis/client.js'
import { setMailer } from './mailer/index.js'
import type { Mailer, SendOptions } from './mailer/index.js'
import { checkBillingAlerts, checkRequestAlerts } from './alert-notifier.js'
import { eq } from 'drizzle-orm'

// Flush promise queue so fire-and-forget async work completes
const tick = () => new Promise(r => setTimeout(r, 50))

let userId: string
let mockMailer: Mailer & { calls: SendOptions[] }

beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email='alert-notifier-test@example.com'")
  const [u] = await db.insert(users).values({
    email: 'alert-notifier-test@example.com',
    passwordHash: 'x', name: 't',
    balanceUsd: '3.000000',
    notifyEmail: true,
  }).returning()
  userId = u!.id
})

afterAll(async () => { await pool.end() })

beforeEach(async () => {
  mockMailer = { calls: [], async send(o) { this.calls.push(o) } }
  setMailer(mockMailer)
  // Clear cooldown keys
  const keys = await redis.keys('alert_sent:*')
  if (keys.length) await redis.del(...keys)
})

afterEach(() => {
  setMailer(null)
})

describe('checkBillingAlerts', () => {
  it('sends email when balance < threshold (balance_low)', async () => {
    const [a] = await db.insert(alerts).values({
      userId, kind: 'balance_low', threshold: '5.00', channel: 'email', enabled: true,
    }).returning()

    checkBillingAlerts(userId)
    await tick()

    expect(mockMailer.calls).toHaveLength(1)
    expect(mockMailer.calls[0]!.to).toBe('alert-notifier-test@example.com')
    expect(mockMailer.calls[0]!.subject).toContain('余额')

    await db.delete(alerts).where(eq(alerts.id, a!.id))
  })

  it('does not send when balance >= threshold', async () => {
    const [a] = await db.insert(alerts).values({
      userId, kind: 'balance_low', threshold: '1.00', channel: 'email', enabled: true,
    }).returning()

    checkBillingAlerts(userId)
    await tick()

    expect(mockMailer.calls).toHaveLength(0)

    await db.delete(alerts).where(eq(alerts.id, a!.id))
  })

  it('respects cooldown — does not send twice within 1 hour', async () => {
    const [a] = await db.insert(alerts).values({
      userId, kind: 'balance_low', threshold: '5.00', channel: 'email', enabled: true,
    }).returning()

    checkBillingAlerts(userId)
    await tick()
    expect(mockMailer.calls).toHaveLength(1)

    // Second call should be suppressed by cooldown
    checkBillingAlerts(userId)
    await tick()
    expect(mockMailer.calls).toHaveLength(1)

    await db.delete(alerts).where(eq(alerts.id, a!.id))
  })

  it('skips disabled alerts', async () => {
    const [a] = await db.insert(alerts).values({
      userId, kind: 'balance_low', threshold: '5.00', channel: 'email', enabled: false,
    }).returning()

    checkBillingAlerts(userId)
    await tick()

    expect(mockMailer.calls).toHaveLength(0)

    await db.delete(alerts).where(eq(alerts.id, a!.id))
  })
})

describe('checkRequestAlerts', () => {
  it('sends email when errorRate meets threshold (error_rate)', async () => {
    const [a] = await db.insert(alerts).values({
      userId, kind: 'error_rate', threshold: '0.5', channel: 'email', enabled: true,
    }).returning()

    checkRequestAlerts(userId, { errorRate: 1, p99Ms: 100 })
    await tick()

    expect(mockMailer.calls).toHaveLength(1)
    expect(mockMailer.calls[0]!.subject).toContain('错误率')

    await db.delete(alerts).where(eq(alerts.id, a!.id))
  })

  it('sends email when latency exceeds threshold (p99_latency)', async () => {
    const [a] = await db.insert(alerts).values({
      userId, kind: 'p99_latency', threshold: '1000', channel: 'email', enabled: true,
    }).returning()

    checkRequestAlerts(userId, { errorRate: 0, p99Ms: 2000 })
    await tick()

    expect(mockMailer.calls).toHaveLength(1)
    expect(mockMailer.calls[0]!.subject).toContain('延迟')

    await db.delete(alerts).where(eq(alerts.id, a!.id))
  })

  it('does not send when metrics are below thresholds', async () => {
    const [a1] = await db.insert(alerts).values({
      userId, kind: 'error_rate', threshold: '0.5', channel: 'email', enabled: true,
    }).returning()
    const [a2] = await db.insert(alerts).values({
      userId, kind: 'p99_latency', threshold: '5000', channel: 'email', enabled: true,
    }).returning()

    checkRequestAlerts(userId, { errorRate: 0, p99Ms: 100 })
    await tick()

    expect(mockMailer.calls).toHaveLength(0)

    await db.delete(alerts).where(eq(alerts.id, a1!.id))
    await db.delete(alerts).where(eq(alerts.id, a2!.id))
  })
})
