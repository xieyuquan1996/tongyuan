# Webhook 通知渠道实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为告警系统新增 Webhook 渠道，用户可在账户设置里配置全局 URL + Bearer Token，每条 webhook 告警可单独覆盖 URL，触发时 POST 结构化 JSON payload，失败仅记录日志不重试。

**Architecture:** 新建 `webhook-sender.ts` 封装 HTTP 投递逻辑（alert-notifier 和 test endpoint 共用）；重构 `alert-notifier.ts` 移除 `notifyEmail` 全局早退，改为 per-channel guard；DB 加三列（users.webhook_url / users.webhook_token / alerts.webhook_url）。

**Tech Stack:** Hono, Drizzle ORM, Postgres 16, Zod, vitest, React + JSX

---

## File Map

| 状态 | 文件 | 职责 |
|------|------|------|
| 新建 | `backend/src/db/migrations/0021_webhook_notification.sql` | 新增三列 |
| 修改 | `backend/src/db/schema.ts` | Drizzle 类型同步 |
| 新建 | `backend/src/services/webhook-sender.ts` | HTTP 投递 + 返回 ok/statusCode |
| 修改 | `backend/src/services/alert-notifier.ts` | 重构为 channel dispatch，加 webhook 分支 |
| 修改 | `backend/src/services/alert-notifier.test.ts` | webhook 分支的 CT |
| 修改 | `backend/src/services/alerts.ts` | create/patch 接受 webhookUrl |
| 修改 | `backend/src/routes/console/alerts.ts` | CHANNEL 加 'webhook'，schema 加 webhookUrl |
| 修改 | `backend/src/routes/console/alerts.test.ts` | 测试 webhookUrl 字段持久化 |
| 修改 | `backend/src/services/users.ts` | toPublicUser 加 webhook_url / webhook_token 脱敏 |
| 修改 | `backend/src/routes/console/auth.ts` | /profile PATCH 接受 webhook 字段；/me GET 返回 webhook_url |
| 新建 | `backend/src/routes/console/webhooks.ts` | POST /api/console/webhooks/test |
| 修改 | `backend/src/app.ts` | 注册 webhooksRoutes |
| 修改 | `frontend/src/pages/dashboard/Alerts.jsx` | 启用 webhook channel，加 URL 输入 + 告警 banner |
| 修改 | `frontend/src/pages/dashboard/Alerts.test.jsx` | webhook channel 前端测试 |
| 修改 | `frontend/src/pages/dashboard/Settings.jsx` | 新增 Webhook 设置区块 + 测试按钮 |
| 新建 | `frontend/src/pages/dashboard/Settings.test.jsx` | Settings webhook 区块测试 |

---

## Task 1: DB Migration + Schema 更新

**Files:**
- Create: `backend/src/db/migrations/0021_webhook_notification.sql`
- Modify: `backend/src/db/schema.ts`

- [ ] **Step 1: 创建迁移文件**

```sql
-- backend/src/db/migrations/0021_webhook_notification.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS webhook_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS webhook_token text;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS webhook_url text;
```

- [ ] **Step 2: 运行迁移**

```bash
cd backend
set -a && source .env && set +a
npx tsx src/db/migrate.ts
```

预期输出：无报错，提示迁移完成。

- [ ] **Step 3: 更新 schema.ts — users 表**

在 `backend/src/db/schema.ts` 的 `users` 表 `updatedAt` 之前加两行：

```ts
  webhookUrl: text('webhook_url'),
  webhookToken: text('webhook_token'),
```

完整位置（在 `updatedAt` 行之前插入）：

```ts
  webhookUrl: text('webhook_url'),
  webhookToken: text('webhook_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 4: 更新 schema.ts — alerts 表**

在 `backend/src/db/schema.ts` 的 `alerts` 表 `createdAt` 之前加一行：

```ts
  webhookUrl: text('webhook_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 5: 类型检查**

```bash
cd backend && npx tsc --noEmit
```

预期：0 errors。

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/migrations/0021_webhook_notification.sql backend/src/db/schema.ts
git commit -m "feat(db): add webhook_url/webhook_token columns for webhook notification channel"
```

---

## Task 2: webhook-sender.ts — 投递核心模块

**Files:**
- Create: `backend/src/services/webhook-sender.ts`

- [ ] **Step 1: 写测试（纯逻辑，mock fetch）**

创建 `backend/src/services/webhook-sender.test.ts`：

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { sendWebhook } from './webhook-sender.js'

afterEach(() => { vi.restoreAllMocks() })

describe('sendWebhook', () => {
  it('POST JSON payload，无 token 时不带 Authorization header', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }) as any,
    )

    const result = await sendWebhook('https://example.com/hook', null, { kind: 'balance_low', threshold: 5 })

    expect(result.ok).toBe(true)
    expect(result.statusCode).toBe(200)
    const [url, init] = mockFetch.mock.calls[0]!
    expect(url).toBe('https://example.com/hook')
    expect((init as RequestInit).method).toBe('POST')
    expect(((init as RequestInit).headers as Record<string, string>)['Authorization']).toBeUndefined()
  })

  it('有 token 时带 Bearer Authorization header', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }) as any,
    )

    await sendWebhook('https://example.com/hook', 'my-secret', { kind: 'balance_low' })

    const [, init] = mockFetch.mock.calls[0]!
    expect(((init as RequestInit).headers as Record<string, string>)['Authorization']).toBe('Bearer my-secret')
  })

  it('非 2xx 响应 → ok=false, statusCode 正确', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Bad Gateway', { status: 502 }) as any,
    )

    const result = await sendWebhook('https://example.com/hook', null, {})

    expect(result.ok).toBe(false)
    expect(result.statusCode).toBe(502)
  })

  it('网络异常 → ok=false, statusCode undefined', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await sendWebhook('https://example.com/hook', null, {})

    expect(result.ok).toBe(false)
    expect(result.statusCode).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd backend && npx vitest run src/services/webhook-sender.test.ts
```

预期：FAIL，`Cannot find module './webhook-sender.js'`

- [ ] **Step 3: 创建 webhook-sender.ts**

```ts
// backend/src/services/webhook-sender.ts
export interface WebhookResult {
  ok: boolean
  statusCode?: number
}

export async function sendWebhook(
  url: string,
  token: string | null,
  payload: Record<string, unknown>,
): Promise<WebhookResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    })
    return { ok: res.ok, statusCode: res.status }
  } catch {
    return { ok: false }
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd backend && npx vitest run src/services/webhook-sender.test.ts
```

预期：4 tests PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/webhook-sender.ts backend/src/services/webhook-sender.test.ts
git commit -m "feat(webhook): add webhook-sender module with fetch + Bearer token support"
```

---

## Task 3: alert-notifier.ts 重构 + webhook 分支

**Files:**
- Modify: `backend/src/services/alert-notifier.ts`
- Modify: `backend/src/services/alert-notifier.test.ts`

- [ ] **Step 1: 在 alert-notifier.test.ts 末尾追加 webhook 测试**

在 `backend/src/services/alert-notifier.test.ts` 文件末尾（`})` 之前）追加：

```ts
describe('checkBillingAlerts — webhook channel', () => {
  it('POST 到 user.webhookUrl 当 per-alert URL 为空', async () => {
    // 设置全局 webhook_url
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

    // 清理
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
```

- [ ] **Step 2: 运行新测试，确认失败**

```bash
cd backend
set -a && source .env && set +a
npx vitest run src/services/alert-notifier.test.ts
```

预期：新增的 webhook 测试 FAIL（`webhookUrl` 字段不存在 / channel 未处理）。

- [ ] **Step 3: 重构 alert-notifier.ts**

用以下内容完整替换 `backend/src/services/alert-notifier.ts`：

```ts
import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users, alerts, billingLedger } from '../db/schema.js'
import { redis } from '../redis/client.js'
import { getMailer } from './mailer/index.js'
import { renderAlertEmail } from './email-templates/index.js'
import { sendWebhook } from './webhook-sender.js'

export function checkBillingAlerts(userId: string): void {
  _checkBilling(userId).catch((err) =>
    console.warn('[alert-notifier] billing check failed', err),
  )
}

export function checkRequestAlerts(userId: string, metrics: { errorRate: number; p99Ms: number }): void {
  _checkRequest(userId, metrics).catch((err) =>
    console.warn('[alert-notifier] request check failed', err),
  )
}

async function _checkBilling(userId: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user) return

  const userAlerts = await db.select().from(alerts).where(
    and(eq(alerts.userId, userId), eq(alerts.enabled, true)),
  )
  const relevant = userAlerts.filter(a => a.kind === 'balance_low' || a.kind === 'spend_daily')
  if (!relevant.length) return

  let dailySpendUsd: number | null = null
  if (relevant.some(a => a.kind === 'spend_daily')) {
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const [row] = await db.select({
      total: sql<string>`coalesce(sum(-amount_usd), 0)::text`,
    }).from(billingLedger).where(
      and(
        eq(billingLedger.userId, userId),
        eq(billingLedger.kind, 'debit_usage'),
        gte(billingLedger.createdAt, dayStart),
      ),
    )
    dailySpendUsd = Number(row!.total)
  }

  for (const alert of relevant) {
    const cooldownKey = `alert_sent:${alert.id}`
    if (await redis.get(cooldownKey)) continue

    let shouldFire = false
    const threshold = Number(alert.threshold)

    if (alert.kind === 'balance_low') {
      if (Number(user.balanceUsd) < threshold) shouldFire = true
    } else if (alert.kind === 'spend_daily') {
      if (dailySpendUsd! >= threshold) shouldFire = true
    }

    if (!shouldFire) continue

    if (alert.channel === 'email' && user.notifyEmail) {
      let emailData: Record<string, unknown>
      if (alert.kind === 'balance_low') {
        emailData = { balance: Number(user.balanceUsd), threshold, triggeredAt: new Date() }
      } else {
        emailData = { dailySpend: dailySpendUsd!, threshold, triggeredAt: new Date() }
      }
      const { subject, html, text } = renderAlertEmail(alert.kind, emailData)
      await getMailer().send({ to: user.email, subject, text, html })
      await redis.set(cooldownKey, '1', 'EX', 3600)
    } else if (alert.channel === 'webhook') {
      const effectiveUrl = alert.webhookUrl || user.webhookUrl
      if (!effectiveUrl) continue
      let payload: Record<string, unknown>
      if (alert.kind === 'balance_low') {
        payload = { kind: alert.kind, threshold, current_balance: Number(user.balanceUsd), triggered_at: new Date().toISOString() }
      } else {
        payload = { kind: alert.kind, threshold, daily_spend: dailySpendUsd!, triggered_at: new Date().toISOString() }
      }
      const result = await sendWebhook(effectiveUrl, user.webhookToken ?? null, payload)
      if (!result.ok) console.warn(`[alert-notifier] webhook ${alert.id} failed`, result.statusCode)
      await redis.set(cooldownKey, '1', 'EX', 3600)
    }
  }
}

async function _checkRequest(userId: string, metrics: { errorRate: number; p99Ms: number }): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user) return

  const userAlerts = await db.select().from(alerts).where(
    and(eq(alerts.userId, userId), eq(alerts.enabled, true)),
  )
  const relevant = userAlerts.filter(a => a.kind === 'error_rate' || a.kind === 'p99_latency')
  if (!relevant.length) return

  for (const alert of relevant) {
    const cooldownKey = `alert_sent:${alert.id}`
    if (await redis.get(cooldownKey)) continue

    let shouldFire = false
    const threshold = Number(alert.threshold)

    if (alert.kind === 'error_rate') {
      if (metrics.errorRate >= threshold) shouldFire = true
    } else if (alert.kind === 'p99_latency') {
      if (metrics.p99Ms >= threshold) shouldFire = true
    }

    if (!shouldFire) continue

    if (alert.channel === 'email' && user.notifyEmail) {
      let emailData: Record<string, unknown>
      if (alert.kind === 'error_rate') {
        emailData = { errorRate: metrics.errorRate, threshold, triggeredAt: new Date() }
      } else {
        emailData = { p99Ms: metrics.p99Ms, threshold, triggeredAt: new Date() }
      }
      const { subject, html, text } = renderAlertEmail(alert.kind, emailData)
      await getMailer().send({ to: user.email, subject, text, html })
      await redis.set(cooldownKey, '1', 'EX', 3600)
    } else if (alert.channel === 'webhook') {
      const effectiveUrl = alert.webhookUrl || user.webhookUrl
      if (!effectiveUrl) continue
      let payload: Record<string, unknown>
      if (alert.kind === 'error_rate') {
        payload = { kind: alert.kind, threshold, error_rate: metrics.errorRate, triggered_at: new Date().toISOString() }
      } else {
        payload = { kind: alert.kind, threshold, p99_ms: metrics.p99Ms, triggered_at: new Date().toISOString() }
      }
      const result = await sendWebhook(effectiveUrl, user.webhookToken ?? null, payload)
      if (!result.ok) console.warn(`[alert-notifier] webhook ${alert.id} failed`, result.statusCode)
      await redis.set(cooldownKey, '1', 'EX', 3600)
    }
  }
}
```

- [ ] **Step 4: 运行全部 alert-notifier 测试**

```bash
cd backend
set -a && source .env && set +a
npx vitest run src/services/alert-notifier.test.ts
```

预期：全部 PASS（原有 email 测试 + 新增 webhook 测试）。

- [ ] **Step 5: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 errors。

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/alert-notifier.ts backend/src/services/alert-notifier.test.ts
git commit -m "feat(alert-notifier): add webhook channel dispatch with per-alert URL override"
```

---

## Task 4: alerts 服务 + 路由更新（webhookUrl 字段）

**Files:**
- Modify: `backend/src/services/alerts.ts`
- Modify: `backend/src/routes/console/alerts.ts`
- Modify: `backend/src/routes/console/alerts.test.ts`

- [ ] **Step 1: 在 alerts.test.ts 末尾追加 webhook 测试**

在 `backend/src/routes/console/alerts.test.ts` 最后一个 `it(...)` 结束后、最外层 `})` 之前追加：

```ts
  it('creates a webhook-channel alert with webhookUrl', async () => {
    const r = await req('/api/console/alerts', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'balance_low', threshold: '5.00', channel: 'webhook',
        webhookUrl: 'https://example.com/hook', enabled: true,
      }),
    })
    expect(r.status).toBe(201)
    const j = await r.json()
    expect(j.channel).toBe('webhook')
    expect(j.webhookUrl).toBe('https://example.com/hook')
    await req(`/api/console/alerts/${j.id}`, { method: 'DELETE' })
  })

  it('rejects invalid webhookUrl with 400', async () => {
    const r = await req('/api/console/alerts', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'balance_low', threshold: '5.00', channel: 'webhook',
        webhookUrl: 'not-a-url', enabled: true,
      }),
    })
    expect(r.status).toBe(400)
  })

  it('patches webhookUrl on existing webhook alert', async () => {
    const cr = await req('/api/console/alerts', {
      method: 'POST',
      body: JSON.stringify({ kind: 'balance_low', threshold: '5.00', channel: 'webhook', enabled: true }),
    })
    const { id } = await cr.json()

    const pr = await req(`/api/console/alerts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ webhookUrl: 'https://new.example.com/hook' }),
    })
    expect(pr.status).toBe(200)
    expect((await pr.json()).webhookUrl).toBe('https://new.example.com/hook')

    await req(`/api/console/alerts/${id}`, { method: 'DELETE' })
  })

  it('clears webhookUrl when patched to empty string', async () => {
    const cr = await req('/api/console/alerts', {
      method: 'POST',
      body: JSON.stringify({ kind: 'balance_low', threshold: '5.00', channel: 'webhook', webhookUrl: 'https://example.com/hook', enabled: true }),
    })
    const { id } = await cr.json()

    const pr = await req(`/api/console/alerts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ webhookUrl: '' }),
    })
    expect(pr.status).toBe(200)
    expect((await pr.json()).webhookUrl).toBeNull()

    await req(`/api/console/alerts/${id}`, { method: 'DELETE' })
  })
```

- [ ] **Step 2: 运行测试，确认新测试失败**

```bash
cd backend
set -a && source .env && set +a
npx vitest run src/routes/console/alerts.test.ts
```

预期：新增的 webhook 测试 FAIL。

- [ ] **Step 3: 更新 services/alerts.ts**

用以下内容完整替换 `backend/src/services/alerts.ts`：

```ts
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { alerts } from '../db/schema.js'
import { AppError } from '../shared/errors.js'

export type AlertRow = typeof alerts.$inferSelect

export async function list(userId: string) {
  return db.select().from(alerts).where(eq(alerts.userId, userId))
}

export async function create(
  userId: string,
  input: { kind: string; threshold: string; channel: string; enabled: boolean; webhookUrl?: string | null },
) {
  const [row] = await db.insert(alerts).values({ userId, ...input }).returning()
  return row!
}

export async function patch(
  userId: string,
  id: string,
  p: Partial<Pick<AlertRow, 'threshold' | 'channel' | 'enabled' | 'webhookUrl'>>,
) {
  const [row] = await db.update(alerts).set(p).where(and(eq(alerts.id, id), eq(alerts.userId, userId))).returning()
  if (!row) throw new AppError('not_found')
  return row
}

export async function remove(userId: string, id: string) {
  const [row] = await db.delete(alerts).where(and(eq(alerts.id, id), eq(alerts.userId, userId))).returning()
  if (!row) throw new AppError('not_found')
}
```

- [ ] **Step 4: 更新 routes/console/alerts.ts**

用以下内容完整替换 `backend/src/routes/console/alerts.ts`：

```ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireBearer } from '../../middleware/auth-bearer.js'
import * as svc from '../../services/alerts.js'

export const alertsRoutes = new Hono()
alertsRoutes.use('*', requireBearer)

const KIND = z.enum(['balance_low', 'spend_daily', 'error_rate', 'p99_latency'])
const CHANNEL = z.enum(['browser', 'email', 'webhook'])
const THRESHOLD = z.union([z.string(), z.number()]).transform((v) => String(v))
const WEBHOOK_URL = z.union([z.string().url(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v && v !== '') ? v : null)

alertsRoutes.get('/', async (c) => c.json({ alerts: await svc.list(c.get('user').id) }))

alertsRoutes.post('/', zValidator('json', z.object({
  kind: KIND,
  threshold: THRESHOLD,
  channel: CHANNEL,
  enabled: z.boolean().default(true),
  webhookUrl: WEBHOOK_URL,
})), async (c) => {
  const b = c.req.valid('json')
  return c.json(await svc.create(c.get('user').id, b), 201)
})

alertsRoutes.patch('/:id', zValidator('json', z.object({
  threshold: THRESHOLD.optional(),
  channel: CHANNEL.optional(),
  enabled: z.boolean().optional(),
  webhookUrl: WEBHOOK_URL,
})), async (c) => c.json(await svc.patch(c.get('user').id, c.req.param('id'), c.req.valid('json'))))

alertsRoutes.delete('/:id', async (c) => {
  await svc.remove(c.get('user').id, c.req.param('id'))
  return c.json({ ok: true })
})
```

- [ ] **Step 5: 运行测试，确认全部通过**

```bash
cd backend
set -a && source .env && set +a
npx vitest run src/routes/console/alerts.test.ts
```

预期：全部 PASS。

- [ ] **Step 6: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 errors。

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/alerts.ts backend/src/routes/console/alerts.ts backend/src/routes/console/alerts.test.ts
git commit -m "feat(alerts): add webhook channel and per-alert webhookUrl field"
```

---

## Task 5: users.ts + auth.ts — 全局 Webhook 设置

**Files:**
- Modify: `backend/src/services/users.ts`
- Modify: `backend/src/routes/console/auth.ts`
- Modify: `backend/src/routes/console/auth.test.ts`

- [ ] **Step 1: 在 auth.test.ts 追加 webhook profile 测试**

找到文件 `backend/src/routes/console/auth.test.ts`，在最后一个 `describe` 块内或末尾追加：

```ts
describe('webhook profile settings', () => {
  let authToken = ''

  beforeAll(async () => {
    const email = `webhook-profile-${Date.now()}@example.com`
    const r = await app.fetch(new Request('http://x/api/console/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'secret123456', name: 'W' }),
    }))
    authToken = (await r.json()).session.token
  })

  async function authReq(path: string, init: RequestInit = {}) {
    return app.fetch(new Request('http://x' + path, {
      ...init,
      headers: { authorization: `Bearer ${authToken}`, 'content-type': 'application/json', ...(init.headers as any) },
    }))
  }

  it('GET /me 返回 webhook_url=null 和 webhook_token=null（初始状态）', async () => {
    const r = await authReq('/api/console/me')
    const j = await r.json()
    expect(j.webhook_url).toBeNull()
    expect(j.webhook_token).toBeNull()
  })

  it('PATCH /profile 保存 webhook_url 和 webhook_token，GET /me 返回脱敏 token', async () => {
    await authReq('/api/console/profile', {
      method: 'PATCH',
      body: JSON.stringify({ webhook_url: 'https://example.com/hook', webhook_token: 'my-secret' }),
    })

    const r = await authReq('/api/console/me')
    const j = await r.json()
    expect(j.webhook_url).toBe('https://example.com/hook')
    expect(j.webhook_token).toBe('••••••••')
  })

  it('PATCH /profile 清除 webhook_url（传空字符串）', async () => {
    await authReq('/api/console/profile', {
      method: 'PATCH',
      body: JSON.stringify({ webhook_url: '' }),
    })

    const r = await authReq('/api/console/me')
    expect((await r.json()).webhook_url).toBeNull()
  })

  it('rejects non-URL webhook_url with 400', async () => {
    const r = await authReq('/api/console/profile', {
      method: 'PATCH',
      body: JSON.stringify({ webhook_url: 'not-a-url' }),
    })
    expect(r.status).toBe(400)
  })
})
```

- [ ] **Step 2: 运行测试，确认新测试失败**

```bash
cd backend
set -a && source .env && set +a
npx vitest run src/routes/console/auth.test.ts
```

预期：webhook profile 测试 FAIL。

- [ ] **Step 3: 更新 users.ts — toPublicUser 加 webhook 字段**

在 `backend/src/services/users.ts` 的 `toPublicUser` 函数中，在 `updated_at` 之前加两行：

```ts
export function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    plan: row.plan,
    balance_usd: row.balanceUsd,
    limit_monthly_usd: row.limitMonthlyUsd,
    theme: row.theme,
    company: row.company,
    phone: row.phone,
    notify_email: row.notifyEmail,
    notify_browser: row.notifyBrowser,
    webhook_url: row.webhookUrl ?? null,
    webhook_token: row.webhookToken ? '••••••••' : null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}
```

- [ ] **Step 4: 更新 auth.ts — profile PATCH 接受 webhook 字段**

在 `backend/src/routes/console/auth.ts` 中，修改 `profileBody` schema，在 `notify_browser` 之后加两个字段：

```ts
const profileBody = z.object({
  name: z.string().max(255).optional(),
  company: z.string().max(255).optional(),
  phone: z.string().max(50).optional(),
  theme: z.enum(['light', 'dark']).optional(),
  notify_email: z.boolean().optional(),
  notify_browser: z.boolean().optional(),
  webhook_url: z.union([z.string().url(), z.literal(''), z.null()]).optional()
    .transform((v) => v === undefined ? undefined : (v && v !== '' ? v : null)),
  webhook_token: z.string().max(512).optional().nullable(),
})
```

在 `authRoutes.patch('/profile', ...)` 的 handler 里，在已有的 `if (b.notify_browser !== undefined)` 之后加：

```ts
  if (b.webhook_url !== undefined) patch.webhookUrl = b.webhook_url
  if (b.webhook_token !== undefined) patch.webhookToken = b.webhook_token || null
```

完整的 handler 变成：

```ts
authRoutes.patch('/profile', requireBearer, zValidator('json', profileBody), async (c) => {
  const u = c.get('user')
  const b = c.req.valid('json')
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (b.name !== undefined) patch.name = b.name
  if (b.company !== undefined) patch.company = b.company
  if (b.phone !== undefined) patch.phone = b.phone
  if (b.theme !== undefined) patch.theme = b.theme
  if (b.notify_email !== undefined) patch.notifyEmail = b.notify_email
  if (b.notify_browser !== undefined) patch.notifyBrowser = b.notify_browser
  if (b.webhook_url !== undefined) patch.webhookUrl = b.webhook_url
  if (b.webhook_token !== undefined) patch.webhookToken = b.webhook_token || null
  const [row] = await db.update(users).set(patch).where(eq(users.id, u.id)).returning()
  return c.json(toPublicUser(row!))
})
```

- [ ] **Step 5: 运行测试**

```bash
cd backend
set -a && source .env && set +a
npx vitest run src/routes/console/auth.test.ts
```

预期：全部 PASS。

- [ ] **Step 6: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 errors。

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/users.ts backend/src/routes/console/auth.ts backend/src/routes/console/auth.test.ts
git commit -m "feat(profile): expose and update global webhook_url/webhook_token via /profile"
```

---

## Task 6: Webhook 测试端点

**Files:**
- Create: `backend/src/routes/console/webhooks.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: 写测试文件**

创建 `backend/src/routes/console/webhooks.test.ts`：

```ts
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest'
import { createApp } from '../../app.js'
import { pool, db } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

const app = createApp()
let token = ''
let userId = ''

beforeAll(async () => {
  const email = `webhook-test-ep-${Date.now()}@example.com`
  await pool.query(`DELETE FROM users WHERE email LIKE 'webhook-test-ep-%'`)
  const r = await app.fetch(new Request('http://x/api/console/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123456', name: 'W' }),
  }))
  const j = await r.json()
  token = j.session.token
  userId = j.user.id
})

afterAll(async () => { await pool.end() })
afterEach(() => { vi.restoreAllMocks() })

async function post(init: RequestInit = {}) {
  return app.fetch(new Request('http://x/api/console/webhooks/test', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...init,
  }))
}

describe('POST /api/console/webhooks/test', () => {
  it('returns 400 when no webhook URL configured', async () => {
    const r = await post()
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('no_webhook_url')
  })

  it('returns ok=true when delivery succeeds', async () => {
    await db.update(users).set({ webhookUrl: 'https://hook.example.com/test' }).where(eq(users.id, userId))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }) as any)

    const r = await post()
    expect(r.status).toBe(200)
    expect((await r.json()).ok).toBe(true)

    await db.update(users).set({ webhookUrl: null }).where(eq(users.id, userId))
  })

  it('returns ok=false with status_code when delivery fails', async () => {
    await db.update(users).set({ webhookUrl: 'https://hook.example.com/test' }).where(eq(users.id, userId))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('error', { status: 500 }) as any)

    const r = await post()
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.ok).toBe(false)
    expect(j.status_code).toBe(500)

    await db.update(users).set({ webhookUrl: null }).where(eq(users.id, userId))
  })

  it('requires auth (401 without token)', async () => {
    const r = await app.fetch(new Request('http://x/api/console/webhooks/test', { method: 'POST' }))
    expect(r.status).toBe(401)
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd backend
set -a && source .env && set +a
npx vitest run src/routes/console/webhooks.test.ts
```

预期：FAIL，路由不存在（404）。

- [ ] **Step 3: 创建 webhooks.ts 路由**

```ts
// backend/src/routes/console/webhooks.ts
import { Hono } from 'hono'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { sendWebhook } from '../../services/webhook-sender.js'
import { AppError } from '../../shared/errors.js'

export const webhooksRoutes = new Hono()
webhooksRoutes.use('*', requireBearer)

webhooksRoutes.post('/test', async (c) => {
  const user = c.get('user')
  const url = user.webhookUrl
  if (!url) throw new AppError('no_webhook_url', 'Webhook URL 未配置', 400)

  const payload = {
    kind: 'test',
    message: '这是 Claude Link 发送的测试 Webhook 请求。',
    triggered_at: new Date().toISOString(),
  }

  const result = await sendWebhook(url, user.webhookToken ?? null, payload)
  return c.json({ ok: result.ok, status_code: result.statusCode ?? null })
})
```

- [ ] **Step 4: 注册路由到 app.ts**

在 `backend/src/app.ts` 中，先加 import：

```ts
import { webhooksRoutes } from './routes/console/webhooks.js'
```

然后在 `app.route('/api/console/alerts', alertsRoutes)` 下方加一行：

```ts
  app.route('/api/console/webhooks', webhooksRoutes)
```

- [ ] **Step 5: 运行测试**

```bash
cd backend
set -a && source .env && set +a
npx vitest run src/routes/console/webhooks.test.ts
```

预期：全部 PASS。

- [ ] **Step 6: 类型检查 + 全量测试**

```bash
npx tsc --noEmit
npm test
```

预期：0 TS errors，所有测试通过。

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/console/webhooks.ts backend/src/routes/console/webhooks.test.ts backend/src/app.ts
git commit -m "feat(webhooks): add POST /api/console/webhooks/test endpoint"
```

---

## Task 7: 前端 Alerts.jsx — Webhook 渠道 + URL 输入

**Files:**
- Modify: `frontend/src/pages/dashboard/Alerts.jsx`
- Modify: `frontend/src/pages/dashboard/Alerts.test.jsx`

- [ ] **Step 1: 在 Alerts.test.jsx 末尾追加 webhook 测试**

在 `frontend/src/pages/dashboard/Alerts.test.jsx` 末尾（最后一个 `})` 之后）追加：

```jsx
describe('Alerts page — webhook channel', () => {
  it('Webhook 出现在 channel 下拉', async () => {
    mockFetch({ alerts: [] }, { notify_email: true, webhook_url: null })
    render(<MemoryRouter><Alerts /></MemoryRouter>)

    fireEvent.click(await screen.findByText('新增告警'))
    await waitFor(() => expect(screen.getByText('浏览器推送')).toBeTruthy())

    fireEvent.click(screen.getByText('浏览器推送').closest('button'))
    await waitFor(() => expect(screen.getByText('Webhook')).toBeTruthy())
  })

  it('选择 Webhook 后出现 URL 输入框', async () => {
    mockFetch({ alerts: [] }, { notify_email: true, webhook_url: null })
    render(<MemoryRouter><Alerts /></MemoryRouter>)

    fireEvent.click(await screen.findByText('新增告警'))
    await waitFor(() => expect(screen.getByText('浏览器推送')).toBeTruthy())

    fireEvent.click(screen.getByText('浏览器推送').closest('button'))
    await waitFor(() => expect(screen.getByText('Webhook')).toBeTruthy())
    fireEvent.click(screen.getByText('Webhook'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/留空则使用全局/)).toBeTruthy()
    })
  })

  it('全局 URL 和 per-alert URL 均为空时显示 warning banner', async () => {
    mockFetch({ alerts: [] }, { notify_email: true, webhook_url: null })
    render(<MemoryRouter><Alerts /></MemoryRouter>)

    fireEvent.click(await screen.findByText('新增告警'))
    await waitFor(() => expect(screen.getByText('浏览器推送')).toBeTruthy())

    fireEvent.click(screen.getByText('浏览器推送').closest('button'))
    await waitFor(() => expect(screen.getByText('Webhook')).toBeTruthy())
    fireEvent.click(screen.getByText('Webhook'))

    await waitFor(() => {
      expect(screen.queryByText(/Webhook URL 未配置/)).not.toBeNull()
    })
  })

  it('全局 URL 已配置时不显示 banner', async () => {
    mockFetch({ alerts: [] }, { notify_email: true, webhook_url: 'https://example.com/hook' })
    render(<MemoryRouter><Alerts /></MemoryRouter>)

    fireEvent.click(await screen.findByText('新增告警'))
    await waitFor(() => expect(screen.getByText('浏览器推送')).toBeTruthy())

    fireEvent.click(screen.getByText('浏览器推送').closest('button'))
    await waitFor(() => expect(screen.getByText('Webhook')).toBeTruthy())
    fireEvent.click(screen.getByText('Webhook'))

    await waitFor(() => {
      expect(screen.queryByText(/Webhook URL 未配置/)).toBeNull()
    })
  })

  it('已有 webhook 告警且全局 URL 为空时显示行内 banner', async () => {
    mockFetch(
      { alerts: [{ id: '1', kind: 'balance_low', threshold: '5', channel: 'webhook', enabled: true, webhookUrl: null }] },
      { notify_email: true, webhook_url: null },
    )
    render(<MemoryRouter><Alerts /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.queryByText(/Webhook URL 未配置/)).not.toBeNull()
    })
  })
})
```

- [ ] **Step 2: 运行前端测试，确认新测试失败**

```bash
cd frontend && npm test -- --run
```

预期：webhook 测试 FAIL。

- [ ] **Step 3: 修改 Alerts.jsx**

1. 在文件顶部的 state 定义部分，在 `notifyEmail` state 下方加：

```jsx
  const [webhookUrl, setWebhookUrl] = useState(null); // 全局 webhook URL
```

2. 修改 `useEffect` 中获取 `/api/console/me` 的部分：

```jsx
  useEffect(() => {
    api("/api/console/me").then((u) => {
      setNotifyEmail(!!u.notify_email);
      setWebhookUrl(u.webhook_url || null);
    }).catch(() => {});
  }, []);
```

3. 将 `CHANNELS` 数组的 webhook 行取消注释：

```jsx
const CHANNELS = [
  { id: "email",   label: "邮件" },
  { id: "browser", label: "浏览器推送" },
  { id: "webhook", label: "Webhook" },
];
```

4. 在 `newAlert` state 定义中加 `webhookUrl` 字段（在 `useState` 初始值里）：

```jsx
  const [newAlert, setNewAlert] = useState({ kind: "balance_low", threshold: 20, channel: "browser", webhookUrl: "" });
```

5. 在新增告警表单的 `add` 函数中，将 `body: newAlert` 改为把 `webhookUrl` 映射为 `webhook_url`（后端路由接受 camelCase，Zod 会处理，保持原样即可），并在 `setNewAlert` 重置时也加 `webhookUrl: ""`：

```jsx
    await api("/api/console/alerts", { method: "POST", body: {
      kind: newAlert.kind,
      threshold: newAlert.threshold,
      channel: newAlert.channel,
      webhookUrl: newAlert.webhookUrl || null,
    }});
    setAdding(false);
    setNewAlert({ kind: "balance_low", threshold: 20, channel: "browser", webhookUrl: "" });
```

6. 在新增告警表单 JSX 的 `Select` 组件（channel 选择）下方，紧接在 `<EmailBanner />` 所在 div 前加 URL 输入（在 `{newAlert.channel === "email" && !notifyEmail && <EmailBanner />}` 这一行之前）：

```jsx
          {newAlert.channel === "webhook" && (
            <div style={{ marginTop: 8 }}>
              <input
                type="url"
                placeholder="留空则使用全局 Webhook URL"
                value={newAlert.webhookUrl}
                onChange={(e) => setNewAlert({ ...newAlert, webhookUrl: e.target.value })}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-1)", color: "var(--text)", fontSize: 13 }}
              />
            </div>
          )}
          {newAlert.channel === "webhook" && !newAlert.webhookUrl && !webhookUrl && <WebhookBanner />}
```

7. 在列表行渲染部分，在已有的 `{a.channel === "email" && !notifyEmail && ...}` 之后（同一个 `<div key={a.id}>` 内）加：

```jsx
                {a.channel === "webhook" && !a.webhookUrl && !webhookUrl && (
                  <div style={{ padding: "0 20px 12px" }}>
                    <WebhookBanner />
                  </div>
                )}
```

8. 在文件末尾（`EmailBanner` 函数定义之后）加 `WebhookBanner`：

```jsx
function WebhookBanner() {
  return (
    <div style={{ ...bannerBase, background: "var(--warn-soft)", borderLeftColor: "var(--warn)", marginTop: 8 }}>
      <span style={{ fontSize: 13 }}>
        Webhook URL 未配置。请前往{" "}
        <a href="/dashboard/settings" style={{ color: "var(--clay)", textDecoration: "none" }}>账户设置</a>
        {" "}填写全局地址，或在此输入覆盖地址。
      </span>
    </div>
  );
}
```

- [ ] **Step 4: 运行前端测试**

```bash
cd frontend && npm test -- --run
```

预期：全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/dashboard/Alerts.jsx frontend/src/pages/dashboard/Alerts.test.jsx
git commit -m "feat(alerts-ui): enable webhook channel with URL input and warning banner"
```

---

## Task 8: 前端 Settings.jsx — 全局 Webhook 配置区块

**Files:**
- Modify: `frontend/src/pages/dashboard/Settings.jsx`
- Create: `frontend/src/pages/dashboard/Settings.test.jsx`

- [ ] **Step 1: 创建 Settings.test.jsx**

```jsx
// frontend/src/pages/dashboard/Settings.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Outlet, Routes, Route } from 'react-router-dom'
import Settings from './Settings.jsx'

// Settings 用 useOutletContext 获取 user，用真实 Outlet 传递 context
vi.mock('../../lib/theme.jsx', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}))

function makeUser(overrides = {}) {
  return {
    name: 'Test', email: 't@example.com', company: '', phone: '',
    notify_email: true, notify_browser: false,
    webhook_url: null, webhook_token: null,
    ...overrides,
  }
}

function renderSettings(user) {
  // 用 Outlet context 传入 user，这是 useOutletContext 的标准测试方式
  const Parent = () => <Outlet context={{ user }} />
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route element={<Parent />}>
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(JSON.stringify({})),
  })
})

afterEach(() => { vi.restoreAllMocks() })

describe('Settings — Webhook 配置区块', () => {
  it('显示 Webhook 通知区块', () => {
    renderSettings(makeUser())
    expect(screen.getByText('Webhook 通知')).toBeTruthy()
  })

  it('初始无 webhook_url 时输入框为空', () => {
    renderSettings(makeUser({ webhook_url: null }))
    const input = screen.getByPlaceholderText(/https:\/\//)
    expect(input.value).toBe('')
  })

  it('已配置 webhook_url 时输入框显示该值', () => {
    renderSettings(makeUser({ webhook_url: 'https://hook.example.com' }))
    const input = screen.getByPlaceholderText(/https:\/\//)
    expect(input.value).toBe('https://hook.example.com')
  })

  it('token 已配置时显示"已配置"提示文字', () => {
    renderSettings(makeUser({ webhook_token: '••••••••' }))
    expect(screen.getByText(/已配置/)).toBeTruthy()
  })

  it('点击发送测试按钮时调用 /api/console/webhooks/test', async () => {
    renderSettings(makeUser({ webhook_url: 'https://hook.example.com' }))
    fireEvent.click(screen.getByText('发送测试'))
    await waitFor(() => {
      const calls = vi.mocked(globalThis.fetch).mock.calls
      expect(calls.some(([url]) => String(url).includes('/api/console/webhooks/test'))).toBe(true)
    })
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd frontend && npm test -- --run src/pages/dashboard/Settings.test.jsx
```

预期：FAIL，找不到"Webhook 通知"文字。

- [ ] **Step 3: 在 Settings.jsx 中加 webhook 状态**

在 `Settings` 函数内，`const [showDeactivate, setShowDeactivate] = useState(false)` 下方加：

```jsx
  const [webhook, setWebhook] = useState({
    url: user.webhook_url || '',
    token: '',
  });
  const [webhookTokenDirty, setWebhookTokenDirty] = useState(false);
  const [webhookBusy, setWebhookBusy] = useState(false);
```

- [ ] **Step 4: 在 Settings.jsx 中加 webhook 操作函数**

在 `savePassword` 函数定义之后加：

```jsx
  async function saveWebhook() {
    setWebhookBusy(true);
    try {
      const body = { webhook_url: webhook.url || null };
      if (webhookTokenDirty) body.webhook_token = webhook.token || null;
      await api("/api/console/profile", { method: "PATCH", body });
      setWebhookTokenDirty(false);
      setToast({ tone: "ok", text: "Webhook 设置已保存" });
    } catch (err) {
      setToast({ tone: "err", text: err.message || "保存失败" });
    } finally { setWebhookBusy(false); }
  }

  async function testWebhook() {
    try {
      const r = await api("/api/console/webhooks/test", { method: "POST" });
      if (r.ok) {
        setToast({ tone: "ok", text: "测试 Webhook 发送成功" });
      } else {
        setToast({ tone: "err", text: `Webhook 响应异常（HTTP ${r.status_code ?? '?'}）` });
      }
    } catch (err) {
      setToast({ tone: "err", text: err.message || "测试失败，请检查 URL" });
    }
  }
```

- [ ] **Step 5: 在 Settings.jsx JSX 中插入 Webhook 区块**

在 `{/* Preferences */}` 区块的 `</div>` 结束之后、`{/* Password */}` 之前插入：

```jsx
      {/* Webhook 通知 */}
      <div style={card}>
        <SectionTitle>Webhook 通知</SectionTitle>
        <Row>
          <Field label="全局 Webhook URL">
            <input
              type="url"
              placeholder="https://your-service.com/webhook"
              value={webhook.url}
              onChange={(e) => setWebhook({ ...webhook, url: e.target.value })}
              onBlur={saveWebhook}
              style={ctrl}
            />
            <Hint>所有 Webhook 告警默认投递到此地址。每条告警也可单独覆盖。</Hint>
          </Field>
          <Field label="Bearer Token">
            <div style={{ position: "relative" }}>
              <input
                type="password"
                placeholder={user.webhook_token ? "已配置（输入新值可覆盖）" : "可选，用于认证"}
                value={webhook.token}
                onChange={(e) => { setWebhook({ ...webhook, token: e.target.value }); setWebhookTokenDirty(true); }}
                onBlur={saveWebhook}
                style={ctrl}
              />
            </div>
            {user.webhook_token && !webhookTokenDirty && (
              <Hint>已配置。输入新值可覆盖，留空并保存可清除。</Hint>
            )}
          </Field>
        </Row>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <button type="button" onClick={testWebhook} disabled={!webhook.url && !user.webhook_url} style={ghostBtn}>
            发送测试
          </button>
          <button type="button" onClick={saveWebhook} disabled={webhookBusy} style={ctaBtn}>
            {webhookBusy && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }}/>}
            保存 Webhook
          </button>
        </div>
      </div>
```

- [ ] **Step 6: 运行前端测试**

```bash
cd frontend && npm test -- --run src/pages/dashboard/Settings.test.jsx
```

预期：全部 PASS。

- [ ] **Step 7: 运行所有前端测试**

```bash
cd frontend && npm test -- --run
```

预期：全部 PASS。

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/dashboard/Settings.jsx frontend/src/pages/dashboard/Settings.test.jsx
git commit -m "feat(settings-ui): add global Webhook URL + Bearer Token configuration section"
```

---

## Task 9: 全量验证

- [ ] **Step 1: 后端全量测试**

```bash
cd backend
set -a && source .env && set +a
npm run typecheck
npm test
```

预期：typecheck 0 errors，所有测试 PASS。

- [ ] **Step 2: 前端全量测试**

```bash
cd frontend && npm test -- --run
```

预期：所有测试 PASS。

- [ ] **Step 3: 最终 Commit**

```bash
git add -A
git commit -m "feat(webhook): webhook notification channel — full stack implementation complete"
```
