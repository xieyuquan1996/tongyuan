# Email Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gmail SMTP email support behind a swappable Mailer abstraction, implement real password reset flow, and send alert emails when billing/request thresholds are crossed.

**Architecture:** A `Mailer` interface isolates all business logic from the transport; `SmtpMailer` (nodemailer + Gmail) is used in production, `ConsoleMailer` (stdout) in dev/test. Password reset tokens live in Redis (TTL 1h). Alert evaluation fires fire-and-forget after `commitRequest` and after each gateway request.

**Tech Stack:** nodemailer, ioredis (existing), drizzle-orm (existing), Hono (existing), vitest

---

## File Map

| Status | File | Role |
|--------|------|------|
| **Create** | `src/services/mailer/interface.ts` | `Mailer` interface + `SendOptions` type |
| **Create** | `src/services/mailer/console.ts` | `ConsoleMailer` — prints to stdout, no real send |
| **Create** | `src/services/mailer/smtp.ts` | `SmtpMailer` — nodemailer + Gmail SMTP |
| **Create** | `src/services/mailer/index.ts` | `getMailer()` singleton factory |
| **Create** | `src/services/mailer/console.test.ts` | Unit test for `ConsoleMailer` |
| **Create** | `src/services/alert-notifier.ts` | `checkBillingAlerts()` + `checkRequestAlerts()` |
| **Create** | `src/services/alert-notifier.test.ts` | Component tests for alert notifier |
| **Modify** | `src/env.ts` | Add `SMTP_HOST/PORT/USER/PASS/FROM`, `FRONTEND_URL` |
| **Modify** | `src/shared/errors.ts` | Add `'invalid_or_expired_token'` error code |
| **Modify** | `src/routes/console/auth.ts` | Implement real forgot + add reset endpoint |
| **Modify** | `src/routes/console/auth.test.ts` | Add forgot/reset tests |
| **Modify** | `src/routes/console/alerts.ts` | Allow `'email'` channel |
| **Modify** | `src/gateway/biller.ts` | Call `checkBillingAlerts()` after debit |
| **Modify** | `src/gateway/handle-messages.ts` | Call `checkRequestAlerts()` at each request end |
| **Modify** | `backend/package.json` | Add `nodemailer` + `@types/nodemailer` |

---

## Task 1: Install nodemailer

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install packages**

Run from `backend/` directory:
```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

- [ ] **Step 2: Verify installation**

```bash
node -e "import('nodemailer').then(m => console.log('ok', typeof m.default.createTransport))"
```
Expected output: `ok function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add nodemailer for Gmail SMTP email sending"
```

---

## Task 2: Add env vars + error code

**Files:**
- Modify: `src/env.ts`
- Modify: `src/shared/errors.ts`

- [ ] **Step 1: Write the failing env test**

Add to the end of `src/env.test.ts`:
```ts
it('accepts optional SMTP and FRONTEND_URL vars', () => {
  const e = parseEnv({
    NODE_ENV: 'development',
    DATABASE_URL: 'postgres://x:x@localhost/x',
    REDIS_URL: 'redis://localhost',
    SESSION_SECRET: 'aaaabbbbccccddddeeeeffffgggghhhh',
    UPSTREAM_KEY_KMS: '0'.repeat(64),
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '465',
    SMTP_USER: 'me@gmail.com',
    SMTP_PASS: 'app-password',
    SMTP_FROM: 'Claude Link <me@gmail.com>',
    FRONTEND_URL: 'https://example.com',
  })
  expect(e.SMTP_HOST).toBe('smtp.gmail.com')
  expect(e.SMTP_PORT).toBe(465)
  expect(e.SMTP_USER).toBe('me@gmail.com')
  expect(e.SMTP_PASS).toBe('app-password')
  expect(e.SMTP_FROM).toBe('Claude Link <me@gmail.com>')
  expect(e.FRONTEND_URL).toBe('https://example.com')
})

it('env without SMTP vars still parses (ConsoleMailer fallback)', () => {
  const e = parseEnv({
    NODE_ENV: 'development',
    DATABASE_URL: 'postgres://x:x@localhost/x',
    REDIS_URL: 'redis://localhost',
    SESSION_SECRET: 'aaaabbbbccccddddeeeeffffgggghhhh',
    UPSTREAM_KEY_KMS: '0'.repeat(64),
  })
  expect(e.SMTP_HOST).toBeUndefined()
  expect(e.FRONTEND_URL).toBeUndefined()
})
```

- [ ] **Step 2: Run test to see it fail**

```bash
cd backend
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/env.test.ts
```
Expected: FAIL — `e.SMTP_HOST` is `undefined` even when provided (schema doesn't know the field yet)

- [ ] **Step 3: Add SMTP fields and FRONTEND_URL to env.ts**

In `src/env.ts`, add after the `DISABLE_USER_QUOTA` field in the schema object:
```ts
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  FRONTEND_URL: z.string().url().optional(),
```

- [ ] **Step 4: Run env test to verify it passes**

```bash
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/env.test.ts
```
Expected: PASS

- [ ] **Step 5: Add error code to errors.ts**

In `src/shared/errors.ts`, add `'invalid_or_expired_token'` to the `ErrorCode` union type:
```ts
export type ErrorCode =
  | 'unauthorized' | 'invalid_credentials' | 'wrong_password'
  | 'missing_fields' | 'invalid_email' | 'weak_password' | 'invalid_amount'
  | 'email_exists' | 'model_exists'
  | 'account_suspended' | 'account_locked' | 'forbidden'
  | 'not_found' | 'route_not_found'
  | 'insufficient_balance' | 'rate_limit'
  | 'unknown_model' | 'method_not_allowed'
  | 'all_upstreams_down' | 'upstream_error'
  | 'not_implemented' | 'internal_error'
  | 'invalid_or_expired_token'
```

Add the HTTP status for it in the `STATUS` map (right before the closing `}`):
```ts
  invalid_or_expired_token: 400,
```

- [ ] **Step 6: Commit**

```bash
git add src/env.ts src/env.test.ts src/shared/errors.ts
git commit -m "feat(env): add SMTP_* and FRONTEND_URL vars; add invalid_or_expired_token error code"
```

---

## Task 3: Mailer abstraction layer

**Files:**
- Create: `src/services/mailer/interface.ts`
- Create: `src/services/mailer/console.ts`
- Create: `src/services/mailer/smtp.ts`
- Create: `src/services/mailer/index.ts`
- Create: `src/services/mailer/console.test.ts`

- [ ] **Step 1: Write failing test for ConsoleMailer**

Create `src/services/mailer/console.test.ts`:
```ts
// src/services/mailer/console.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ConsoleMailer } from './console.js'

describe('ConsoleMailer', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('resolves without throwing', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const mailer = new ConsoleMailer()
    await expect(mailer.send({
      to: 'test@example.com',
      subject: 'Hello',
      text: 'World',
    })).resolves.toBeUndefined()
  })

  it('logs the recipient and subject', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const mailer = new ConsoleMailer()
    await mailer.send({ to: 'a@b.com', subject: 'Test subject', text: 'body' })
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('a@b.com'),
    )
  })
})
```

- [ ] **Step 2: Run test to see it fail**

```bash
cd backend
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/services/mailer/console.test.ts
```
Expected: FAIL — `Cannot find module './console.js'`

- [ ] **Step 3: Create the interface file**

Create `src/services/mailer/interface.ts`:
```ts
// src/services/mailer/interface.ts
export type SendOptions = {
  to: string
  subject: string
  text: string
  html?: string
}

export interface Mailer {
  send(opts: SendOptions): Promise<void>
}
```

- [ ] **Step 4: Create ConsoleMailer**

Create `src/services/mailer/console.ts`:
```ts
// src/services/mailer/console.ts
import type { Mailer, SendOptions } from './interface.js'

export class ConsoleMailer implements Mailer {
  async send(opts: SendOptions): Promise<void> {
    console.log(`[mailer:console] to=${opts.to} subject="${opts.subject}"\n${opts.text}`)
  }
}
```

- [ ] **Step 5: Run test to see it pass**

```bash
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/services/mailer/console.test.ts
```
Expected: PASS

- [ ] **Step 6: Create SmtpMailer**

Create `src/services/mailer/smtp.ts`:
```ts
// src/services/mailer/smtp.ts
import nodemailer from 'nodemailer'
import type { Mailer, SendOptions } from './interface.js'
import { env } from '../../env.js'

export class SmtpMailer implements Mailer {
  private transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  })

  async send(opts: SendOptions): Promise<void> {
    const from = env.SMTP_FROM ?? env.SMTP_USER
    await this.transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    })
  }
}
```

- [ ] **Step 7: Create factory**

Create `src/services/mailer/index.ts`:
```ts
// src/services/mailer/index.ts
import type { Mailer } from './interface.js'
import { ConsoleMailer } from './console.js'
import { SmtpMailer } from './smtp.js'
import { env } from '../../env.js'

export type { Mailer, SendOptions } from './interface.js'

let _mailer: Mailer | null = null

export function getMailer(): Mailer {
  if (_mailer) return _mailer
  _mailer = env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS
    ? new SmtpMailer()
    : new ConsoleMailer()
  return _mailer
}

// Test helper: override the singleton (call with null to reset).
export function setMailer(m: Mailer | null): void {
  _mailer = m
}
```

- [ ] **Step 8: Typecheck**

```bash
cd backend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add src/services/mailer/
git commit -m "feat(mailer): add Mailer abstraction with ConsoleMailer + SmtpMailer"
```

---

## Task 4: Password reset — forgot + reset endpoints

**Files:**
- Modify: `src/routes/console/auth.ts`
- Modify: `src/routes/console/auth.test.ts`

- [ ] **Step 1: Write failing tests**

Add to the `describe('auth routes')` block in `src/routes/console/auth.test.ts`:
```ts
  describe('password reset', () => {
    let resetEmail: string
    let capturedToken: string

    beforeAll(async () => {
      resetEmail = `auth-test-reset-${Date.now()}@example.com`
      await post('/api/console/register', { email: resetEmail, password: 'oldpass1', name: 'R' })
    })

    it('forgot with unknown email returns 200 (no enumeration)', async () => {
      const r = await post('/api/console/forgot', { email: 'nobody@example.com' })
      expect(r.status).toBe(200)
      expect((await r.json()).ok).toBe(true)
    })

    it('forgot with known email returns 200 and stores token in Redis', async () => {
      // Capture what ConsoleMailer would log
      const logs: string[] = []
      const orig = console.log
      console.log = (...args: unknown[]) => { logs.push(args.join(' ')); orig(...args) }

      const r = await post('/api/console/forgot', { email: resetEmail })

      console.log = orig
      expect(r.status).toBe(200)

      // Extract token from console log line
      const logLine = logs.find(l => l.includes('reset-password'))
      expect(logLine).toBeDefined()
      const match = logLine!.match(/token=([a-f0-9]{64})/)
      expect(match).toBeTruthy()
      capturedToken = match![1]!
    })

    it('reset with invalid token returns 400', async () => {
      const r = await post('/api/console/reset', { token: 'a'.repeat(64), password: 'newpass1' })
      expect(r.status).toBe(400)
      expect((await r.json()).error).toBe('invalid_or_expired_token')
    })

    it('reset with weak password returns 400', async () => {
      const r = await post('/api/console/reset', { token: capturedToken, password: '123' })
      expect(r.status).toBe(400)
      expect((await r.json()).error).toBe('weak_password')
    })

    it('reset with valid token updates password and token is deleted', async () => {
      const r = await post('/api/console/reset', { token: capturedToken, password: 'newpass1' })
      expect(r.status).toBe(200)
      expect((await r.json()).ok).toBe(true)

      // Can now login with new password
      const r2 = await post('/api/console/login', { email: resetEmail, password: 'newpass1' })
      expect(r2.status).toBe(200)

      // Token is one-time: second reset with same token fails
      const r3 = await post('/api/console/reset', { token: capturedToken, password: 'anotherpass' })
      expect(r3.status).toBe(400)
      expect((await r3.json()).error).toBe('invalid_or_expired_token')
    })
  })
```

Also add `beforeAll` import at the top of the file if not already present (it's already in the import).

- [ ] **Step 2: Run tests to see them fail**

```bash
cd backend
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/routes/console/auth.test.ts
```
Expected: FAIL — `POST /api/console/reset` returns 404; forgot doesn't set Redis key

- [ ] **Step 3: Implement forgot + reset in auth.ts**

Replace the stub `authRoutes.post('/forgot', ...)` line and add the reset route at the bottom of `src/routes/console/auth.ts`.

First add imports at the top of the file (after existing imports):
```ts
import { randomBytes } from 'node:crypto'
import { redis } from '../../redis/client.js'
import { getMailer } from '../../services/mailer/index.js'
import { env } from '../../env.js'
```

Replace the existing stub:
```ts
authRoutes.post('/forgot', async (c) => c.json({ ok: true, hint: '如果该邮箱已注册，我们已经发送了重置链接。' }))
```

With:
```ts
authRoutes.post('/forgot', zValidator('json', z.object({ email: z.string() })), async (c) => {
  const { email } = c.req.valid('json')
  const hint = '如果该邮箱已注册，我们已经发送了重置链接。'

  const user = await db.query.users.findFirst({ where: eq(users.email, email.trim().toLowerCase()) })
  if (!user) return c.json({ ok: true, hint })

  const token = randomBytes(32).toString('hex')
  await redis.set(`pw_reset:${token}`, user.id, 'EX', 3600)

  const baseUrl = env.FRONTEND_URL ?? 'http://localhost:5173'
  const resetLink = `${baseUrl}/reset-password?token=${token}`

  await getMailer().send({
    to: user.email,
    subject: '密码重置链接',
    text: `请点击以下链接重置您的密码（1小时内有效）：\n\n${resetLink}\n\n如果您未申请重置密码，请忽略此邮件。`,
  })

  return c.json({ ok: true, hint })
})

authRoutes.post('/reset', zValidator('json', z.object({ token: z.string(), password: z.string() })), async (c) => {
  const { token, password } = c.req.valid('json')

  const userId = await redis.get(`pw_reset:${token}`)
  if (!userId) throw new AppError('invalid_or_expired_token')
  if (password.length < 6) throw new AppError('weak_password')

  await db.update(users).set({ passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(users.id, userId))
  await redis.del(`pw_reset:${token}`)

  return c.json({ ok: true })
})
```

Note: the test captures the token from console log, so the `ConsoleMailer` output must include the token. Update `console.ts` to log the full link:
```ts
// Already fine since we log opts.text which contains the link+token
```

But we also need the test to find `token=<hex>` in the log. The link is `.../reset-password?token=<hex>` so the regex `/token=([a-f0-9]{64})/` will match. Verify this is true — the link contains `token=` followed by the 64-char hex token. ✓

- [ ] **Step 4: Run tests to see them pass**

```bash
cd backend
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/routes/console/auth.test.ts
```
Expected: all PASS

- [ ] **Step 5: Typecheck**

```bash
cd backend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/routes/console/auth.ts src/routes/console/auth.test.ts
git commit -m "feat(auth): implement password reset via email (forgot + reset endpoints)"
```

---

## Task 5: Alert notifier service

**Files:**
- Create: `src/services/alert-notifier.ts`
- Create: `src/services/alert-notifier.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/services/alert-notifier.test.ts`:
```ts
// src/services/alert-notifier.test.ts
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
```

- [ ] **Step 2: Run test to see it fail**

```bash
cd backend
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/services/alert-notifier.test.ts
```
Expected: FAIL — `Cannot find module './alert-notifier.js'`

- [ ] **Step 3: Create alert-notifier.ts**

Create `src/services/alert-notifier.ts`:
```ts
// src/services/alert-notifier.ts
import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users, alerts, billingLedger } from '../db/schema.js'
import { redis } from '../redis/client.js'
import { getMailer } from './mailer/index.js'

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
  if (!user?.notifyEmail) return

  const userAlerts = await db.select().from(alerts).where(
    and(eq(alerts.userId, userId), eq(alerts.enabled, true)),
  )
  const relevant = userAlerts.filter(a => a.kind === 'balance_low' || a.kind === 'spend_daily')
  if (!relevant.length) return

  let dailySpendUsd: number | null = null

  for (const alert of relevant) {
    const cooldownKey = `alert_sent:${alert.id}`
    if (await redis.get(cooldownKey)) continue

    let shouldFire = false
    let subject = ''
    let text = ''
    const threshold = Number(alert.threshold)

    if (alert.kind === 'balance_low') {
      const balance = Number(user.balanceUsd)
      if (balance < threshold) {
        shouldFire = true
        subject = '余额不足提醒'
        text = `您的账户余额（$${balance.toFixed(4)}）已低于设定阈值 $${threshold.toFixed(4)}，请及时充值。`
      }
    } else if (alert.kind === 'spend_daily') {
      if (dailySpendUsd === null) {
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
      if (dailySpendUsd >= threshold) {
        shouldFire = true
        subject = '日消费超限提醒'
        text = `您今日消费（$${dailySpendUsd.toFixed(4)}）已达到设定阈值 $${threshold.toFixed(4)}。`
      }
    }

    if (shouldFire) {
      await getMailer().send({ to: user.email, subject, text })
      await redis.set(cooldownKey, '1', 'EX', 3600)
    }
  }
}

async function _checkRequest(userId: string, metrics: { errorRate: number; p99Ms: number }): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user?.notifyEmail) return

  const userAlerts = await db.select().from(alerts).where(
    and(eq(alerts.userId, userId), eq(alerts.enabled, true)),
  )
  const relevant = userAlerts.filter(a => a.kind === 'error_rate' || a.kind === 'p99_latency')
  if (!relevant.length) return

  for (const alert of relevant) {
    const cooldownKey = `alert_sent:${alert.id}`
    if (await redis.get(cooldownKey)) continue

    let shouldFire = false
    let subject = ''
    let text = ''
    const threshold = Number(alert.threshold)

    if (alert.kind === 'error_rate') {
      if (metrics.errorRate >= threshold) {
        shouldFire = true
        subject = '请求错误率告警'
        text = `本次请求错误率（${(metrics.errorRate * 100).toFixed(1)}%）已超过设定阈值 ${(threshold * 100).toFixed(1)}%。`
      }
    } else if (alert.kind === 'p99_latency') {
      if (metrics.p99Ms >= threshold) {
        shouldFire = true
        subject = 'P99 延迟告警'
        text = `本次请求延迟（${metrics.p99Ms}ms）已超过设定阈值 ${threshold}ms。`
      }
    }

    if (shouldFire) {
      await getMailer().send({ to: user.email, subject, text })
      await redis.set(cooldownKey, '1', 'EX', 3600)
    }
  }
}
```

- [ ] **Step 4: Run tests to see them pass**

```bash
cd backend
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/services/alert-notifier.test.ts
```
Expected: all PASS

- [ ] **Step 5: Typecheck**

```bash
cd backend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/services/alert-notifier.ts src/services/alert-notifier.test.ts
git commit -m "feat(alerts): add alert-notifier service with billing and request alert evaluation"
```

---

## Task 6: Wire biller.ts and handle-messages.ts

**Files:**
- Modify: `src/gateway/biller.ts`
- Modify: `src/gateway/handle-messages.ts`

- [ ] **Step 1: Wire checkBillingAlerts into biller.ts**

In `src/gateway/biller.ts`, add import after the existing imports:
```ts
import { checkBillingAlerts } from '../services/alert-notifier.js'
```

In `commitRequest`, after the final metrics block (at the very end of the function, after `billingUsdConsumed.inc(...)`), add:
```ts
  if (Number(input.chargeUsd) > 0) {
    checkBillingAlerts(input.userId)
  }
```

The end of `commitRequest` should now look like:
```ts
  // Metrics are best-effort and live outside the transaction.
  gatewayRequests.inc({ model: input.model, status: String(input.status) })
  gatewayLatency.observe({ model: input.model, phase: 'total' }, input.latencyMs)
  if (input.ttfbMs !== null) {
    gatewayLatency.observe({ model: input.model, phase: 'ttfb' }, input.ttfbMs)
  }
  if (Number(input.chargeUsd) > 0) {
    billingUsdConsumed.inc({ model: input.model }, Number(input.chargeUsd))
  }
  if (Number(input.chargeUsd) > 0) {
    checkBillingAlerts(input.userId)
  }
}
```

- [ ] **Step 2: Wire checkRequestAlerts into handle-messages.ts**

In `src/gateway/handle-messages.ts`, add import:
```ts
import { checkRequestAlerts } from '../services/alert-notifier.js'
```

There are four `commitRequest` call sites. Add `checkRequestAlerts` after each one:

**Non-stream error path** (after the `commitRequest` call in the `if (!response || !upstream || !reservation)` block, before the `throw`):
```ts
    await commitRequest({
      // ... existing ...
      chargeUsd: '0', costUsd: '0',
      // ...
    })
    checkRequestAlerts(user.id, { errorRate: 1, p99Ms: Date.now() - started })
    throw new AppError((errorCode as any) ?? 'all_upstreams_down')
```

**Non-stream success path** (after the `commitRequest` call inside the `try` block of `handleNonStream`, before `return new Response`):
```ts
    await commitRequest({
      // ... existing ...
    })
    checkRequestAlerts(user.id, { errorRate: response.status >= 400 ? 1 : 0, p99Ms: Date.now() - started })
    return new Response(text, {
```

**Stream error path** (after the `commitRequest` call in the `if (!response || !upstream || !reservation)` block of `handleStream`, before the `throw`):
```ts
    await commitRequest({
      // ... existing ...
      chargeUsd: '0', costUsd: '0',
      // ...
    })
    checkRequestAlerts(user.id, { errorRate: 1, p99Ms: Date.now() - started })
    throw new AppError((errorCode as any) ?? 'all_upstreams_down')
```

**Stream success path** (inside the `finally` block of the `stream()` callback, after the `commitRequest` call):
```ts
      await commitRequest({
        // ... existing ...
      })
      checkRequestAlerts(user.id, { errorRate: response!.status >= 400 ? 1 : 0, p99Ms: Date.now() - started })
```

- [ ] **Step 3: Typecheck**

```bash
cd backend && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Run the biller tests to ensure nothing broke**

```bash
cd backend
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/gateway/biller.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/gateway/biller.ts src/gateway/handle-messages.ts
git commit -m "feat(gateway): wire checkBillingAlerts and checkRequestAlerts into request path"
```

---

## Task 7: Open 'email' channel in alerts route

**Files:**
- Modify: `src/routes/console/alerts.ts`
- Modify: `src/routes/console/alerts.test.ts`

- [ ] **Step 1: Write failing test**

Add to `src/routes/console/alerts.test.ts` (inside the `describe('alerts routes')` block):
```ts
  it('creates an email-channel alert', async () => {
    const r = await req('/api/console/alerts', {
      method: 'POST',
      body: JSON.stringify({ kind: 'spend_daily', threshold: '10.00', channel: 'email', enabled: true }),
    })
    expect(r.status).toBe(201)
    const j = await r.json()
    expect(j.channel).toBe('email')
    // clean up
    await req(`/api/console/alerts/${j.id}`, { method: 'DELETE' })
  })
```

- [ ] **Step 2: Run test to see it fail**

```bash
cd backend
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/routes/console/alerts.test.ts
```
Expected: FAIL — 400 because `'email'` is not in the allowed channel enum

- [ ] **Step 3: Update CHANNEL enum in alerts.ts**

In `src/routes/console/alerts.ts`, replace:
```ts
const CHANNEL = z.enum(['browser'])
```
With:
```ts
const CHANNEL = z.enum(['browser', 'email'])
```

Also remove the comment block above it (it is now outdated):
```ts
// 目前只有 browser 通道是端到端通的（前端 alert-poller 轮询 + Notification）。
// email / webhook 的后端 evaluator 还没写，投递链路也不存在，所以暂时在 API 层就拒收。
```

- [ ] **Step 4: Run tests to see them pass**

```bash
cd backend
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/routes/console/alerts.test.ts
```
Expected: all PASS

- [ ] **Step 5: Run full test suite**

```bash
cd backend
env $(cat .env | grep -v '^#' | grep '=' | xargs) npm test
```
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/console/alerts.ts src/routes/console/alerts.test.ts
git commit -m "feat(alerts): open email channel; remove outdated not-implemented comment"
```

---

## .env.example update

- [ ] **Step 1: Add SMTP vars to .env.example**

In `backend/.env.example`, add after the existing `DISABLE_USER_QUOTA=` line:
```
# Email (Gmail SMTP via App Password). Leave blank to use ConsoleMailer (logs to stdout).
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
FRONTEND_URL=
```

- [ ] **Step 2: Commit**

```bash
git add backend/.env.example
git commit -m "chore: document SMTP and FRONTEND_URL env vars in .env.example"
```
