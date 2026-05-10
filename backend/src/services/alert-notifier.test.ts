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
    expect(mockMailer.calls[0]!.html).toBeDefined()
    expect(mockMailer.calls[0]!.html).toContain('<!DOCTYPE html')

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
    expect(mockMailer.calls[0]!.html).toBeDefined()
    expect(mockMailer.calls[0]!.html).toContain('<!DOCTYPE html')

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

describe('checkBillingAlerts — webhook channel', () => {
  it('POST 到 user.webhookUrl 当 per-alert URL 为空', async () => {
    await db.update(users).set({ webhookUrl: 'https://hook.example.com/billing' }).where(eq(users.id, userId))

    const [a] = await db.insert(alerts).values({
      userId, kind: 'balance_low', threshold: '5.00', channel: 'webhook', enabled: true,
    }).returning()

    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }) as any,
    )

    checkBillingAlerts(userId)
    await tick()

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0]!
    expect(url).toBe('https://hook.example.com/billing')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.kind).toBe('balance_low')
    expect(body.threshold).toBe(5)
    expect(body.current_balance).toBeCloseTo(3, 1)
    expect(body.triggered_at).toBeTruthy()

    await db.update(users).set({ webhookUrl: null }).where(eq(users.id, userId))
    await db.delete(alerts).where(eq(alerts.id, a!.id))
  })

  it('per-alert URL 覆盖 user 全局 URL', async () => {
    await db.update(users).set({ webhookUrl: 'https://global.example.com', webhookToken: 'tok123' }).where(eq(users.id, userId))

    const [a] = await db.insert(alerts).values({
      userId, kind: 'balance_low', threshold: '5.00', channel: 'webhook', enabled: true,
      webhookUrl: 'https://per-alert.example.com',
    }).returning()

    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }) as any,
    )

    checkBillingAlerts(userId)
    await tick()

    const [url, init] = mockFetch.mock.calls[0]!
    expect(url).toBe('https://per-alert.example.com')
    expect(((init as RequestInit).headers as Record<string, string>)['Authorization']).toBe('Bearer tok123')

    await db.update(users).set({ webhookUrl: null, webhookToken: null }).where(eq(users.id, userId))
    await db.delete(alerts).where(eq(alerts.id, a!.id))
  })

  it('URL 为空时跳过，不调用 fetch', async () => {
    await db.update(users).set({ webhookUrl: null }).where(eq(users.id, userId))
    const [a] = await db.insert(alerts).values({
      userId, kind: 'balance_low', threshold: '5.00', channel: 'webhook', enabled: true,
    }).returning()

    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }) as any)

    checkBillingAlerts(userId)
    await tick()

    expect(mockFetch).not.toHaveBeenCalled()
    await db.delete(alerts).where(eq(alerts.id, a!.id))
  })

  it('非 2xx 响应时仍写入 cooldown key', async () => {
    await db.update(users).set({ webhookUrl: 'https://bad.example.com' }).where(eq(users.id, userId))
    const [a] = await db.insert(alerts).values({
      userId, kind: 'balance_low', threshold: '5.00', channel: 'webhook', enabled: true,
    }).returning()

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('error', { status: 500 }) as any)

    checkBillingAlerts(userId)
    await tick()

    const cooldown = await redis.get(`alert_sent:${a!.id}`)
    expect(cooldown).toBe('1')

    await db.update(users).set({ webhookUrl: null }).where(eq(users.id, userId))
    await db.delete(alerts).where(eq(alerts.id, a!.id))
  })
})

describe('checkRequestAlerts — webhook channel', () => {
  it('POST 到 webhookUrl 当错误率触发', async () => {
    await db.update(users).set({ webhookUrl: 'https://hook.example.com/req' }).where(eq(users.id, userId))
    const [a] = await db.insert(alerts).values({
      userId, kind: 'error_rate', threshold: '0.5', channel: 'webhook', enabled: true,
    }).returning()

    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }) as any)

    checkRequestAlerts(userId, { errorRate: 1, p99Ms: 100 })
    await tick()

    expect(mockFetch).toHaveBeenCalledOnce()
    const body = JSON.parse((mockFetch.mock.calls[0]![1] as RequestInit).body as string)
    expect(body.kind).toBe('error_rate')
    expect(body.error_rate).toBe(1)

    await db.update(users).set({ webhookUrl: null }).where(eq(users.id, userId))
    await db.delete(alerts).where(eq(alerts.id, a!.id))
  })
})
