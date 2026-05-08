# Email Notification Design

Date: 2026-05-08

## Overview

Implement email notification for two scenarios:
1. Password reset — make `/auth/forgot` actually send a reset link
2. Alert notifications — send email when billing/request alerts fire

Transport: Gmail SMTP via Google App Password (`nodemailer`), behind an abstraction layer so the transport can be swapped without touching business logic.

---

## Part 1: Mailer Abstraction Layer

### File layout

```
backend/src/services/mailer/
  interface.ts      ← Mailer interface + SendOptions type
  smtp.ts           ← SmtpMailer: nodemailer + Gmail SMTP
  console.ts        ← ConsoleMailer: logs to stdout (dev/test)
  index.ts          ← getMailer() singleton factory
```

### Interface

```ts
// interface.ts
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

### Factory

`getMailer()` reads env vars and returns the appropriate implementation:
- `SMTP_HOST` present → `SmtpMailer`
- Otherwise → `ConsoleMailer` (prints to logger, no real send)

### New env vars (all optional)

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465                              # default 465 (SSL)
SMTP_USER=you@gmail.com
SMTP_PASS=<google-app-password>
SMTP_FROM="Claude Link <you@gmail.com>"   # defaults to SMTP_USER
FRONTEND_URL=https://your-domain.com      # used in reset link
```

`env.ts` adds these as optional fields (no startup failure if absent; `ConsoleMailer` is used as fallback).

---

## Part 2: Password Reset Flow

### New / modified endpoints (`src/routes/console/auth.ts`)

**`POST /auth/forgot`** (existing — replace stub)
1. Look up user by email (case-insensitive)
2. If not found: return `{ ok: true, hint: "..." }` anyway (prevent user enumeration)
3. Generate token: `crypto.randomBytes(32).toString('hex')` (64-char hex)
4. Store in Redis: `pw_reset:<token>` → `userId`, TTL 3600 s
5. Send email via `getMailer().send(...)` with reset link `${FRONTEND_URL}/reset-password?token=<token>`
6. Return `{ ok: true, hint: "..." }`

**`POST /auth/reset`** (new)
- Body: `{ token: string, password: string }`
1. `redis.get('pw_reset:<token>')` → userId; if null throw `AppError('invalid_or_expired_token')`
2. Validate `password.length >= 6`; throw `AppError('weak_password')` if not
3. Hash new password, update `users.passwordHash`
4. `redis.del('pw_reset:<token>')` (one-time use)
5. Return `{ ok: true }`

### Token properties
- 32 bytes random → 64-char hex string (128 bits entropy)
- TTL: 1 hour
- Single-use: deleted immediately on successful reset

---

## Part 3: Alert Evaluation & Email Notification

### New file: `src/services/alert-notifier.ts`

Exports two functions called fire-and-forget (never awaited, catches all errors):

```ts
export function checkBillingAlerts(userId: string): void
export function checkRequestAlerts(userId: string, metrics: { errorRate: number; p99Ms: number }): void
```

### Alert types and triggers

| Alert kind     | Trigger point                      | Data source                                |
|----------------|------------------------------------|--------------------------------------------|
| `balance_low`  | After debit in `biller.ts`         | `users.balanceUsd` vs threshold (USD)       |
| `spend_daily`  | After debit in `biller.ts`         | Sum of today's `billingLedger` debits (USD)|
| `error_rate`   | After request in `handle-messages.ts` | Caller-supplied `errorRate` (0–1 ratio) |
| `p99_latency`  | After request in `handle-messages.ts` | Caller-supplied `p99Ms` (milliseconds)  |

### Deduplication (cooldown)

After sending an email for an alert, write Redis key `alert_sent:<alertId>` with TTL 3600 s. Skip sending if key exists.

### Email templates

Plain-text templates inline in `alert-notifier.ts`. One template per alert kind. Switching to HTML later only requires changing these strings.

### Integration points

- **`biller.ts`**: after recording the debit, call `checkBillingAlerts(userId)` (fire-and-forget)
- **`handle-messages.ts`**: in the `finally` block, call `checkRequestAlerts(userId, { errorRate, p99Ms })` (fire-and-forget)

### Error handling

All errors inside `checkBillingAlerts` / `checkRequestAlerts` are caught and logged at `warn` level. They never propagate to the request path.

---

## Testing

### Unit tests (`mailer/smtp.test.ts`, `mailer/console.test.ts`)
- `ConsoleMailer.send()` resolves without error and logs the message

### Component tests (`services/alert-notifier.test.ts`)
- Mock `getMailer()` to capture `send()` calls
- Verify correct alert fires when threshold crossed
- Verify cooldown deduplication prevents double-send

### Functional tests (`routes/console/auth.test.ts`)
- `POST /auth/forgot` with unknown email → 200, no email sent
- `POST /auth/forgot` with known email → 200, email sent (mock mailer), Redis key set
- `POST /auth/reset` with valid token → 200, password updated, token deleted
- `POST /auth/reset` with expired/invalid token → 400 `invalid_or_expired_token`
- `POST /auth/reset` with weak password → 400 `weak_password`
