# Email Alert Notification + Email UI Optimization

Date: 2026-05-09

## Overview

Enable email notification channel on the Alerts page and upgrade plain-text alert emails to HTML with a card-based design (gradient purple theme).

---

## Part 1: Email Template System (Backend)

### File layout

```
backend/src/services/email-templates/
  alert-base.ts        ← wrapLayout(title, body): base HTML structure (header, footer, responsive wrapper)
  alert-balance-low.ts ← renderBalanceLow(data): balance alert card
  alert-spend-daily.ts ← renderSpendDaily(data): daily spend alert card
  alert-error-rate.ts  ← renderErrorRate(data): error rate alert card
  alert-p99-latency.ts ← renderP99Latency(data): p99 latency alert card
  index.ts             ← renderAlertEmail(kind, data): { subject, html, text }
```

### Base layout (`alert-base.ts`)

`wrapLayout(title: string, bodyHtml: string): string`

Structure:
- Outer wrapper: `max-width: 600px`, centered, `font-family: -apple-system, ...`
- Header: gradient purple background (`#667eea → #764ba2`), white "Claude Link" text
- Body: white background, 24px padding, contains `bodyHtml`
- Footer: light gray background, "此邮件由系统自动发送 · 管理告警设置" (link to `/dashboard/alerts`)

### Per-kind templates

Each template function signature:

```ts
// alert-balance-low.ts
export function renderBalanceLow(data: { balance: number; threshold: number; triggeredAt: Date }): { subject: string; html: string; text: string }

// alert-spend-daily.ts
export function renderSpendDaily(data: { dailySpend: number; threshold: number; triggeredAt: Date }): { subject: string; html: string; text: string }

// alert-error-rate.ts
export function renderErrorRate(data: { errorRate: number; threshold: number; triggeredAt: Date }): { subject: string; html: string; text: string }

// alert-p99-latency.ts
export function renderP99Latency(data: { p99Ms: number; threshold: number; triggeredAt: Date }): { subject: string; html: string; text: string }
```

Each returns:
- `subject`: Chinese subject line (same as current)
- `html`: HTML email body wrapped in `wrapLayout()`
- `text`: Plain-text fallback (same as current text)

### Card design (per template)

- Alert level indicator: colored left-border bar
  - `balance_low` / `spend_daily`: red (`#ef4444`)
  - `error_rate` / `p99_latency`: amber (`#f59e0b`)
- Alert title in the colored bar area
- Description text below
- Two data cards side-by-side:
  - Left card: "当前值" with value in alert color (red/amber)
  - Right card: "告警阈值" with value in indigo (`#4338ca`)
- Cards have gradient background + colored border
- Trigger timestamp at bottom, separated by a thin divider
- No CTA buttons

### Unified entry point (`index.ts`)

```ts
export function renderAlertEmail(kind: string, data: Record<string, unknown>): { subject: string; html: string; text: string }
```

Dispatches to the appropriate per-kind renderer.

---

## Part 2: Backend Integration (`alert-notifier.ts`)

### Changes

Replace inline `subject` + `text` construction with calls to `renderAlertEmail()`:

```ts
// Before:
await getMailer().send({ to: user.email, subject, text })

// After:
const { subject, html, text } = renderAlertEmail(alert.kind, { balance, threshold, triggeredAt: new Date() })
await getMailer().send({ to: user.email, subject, text, html })
```

Both `_checkBilling` and `_checkRequest` functions get this treatment.

---

## Part 3: Frontend Changes (`Alerts.jsx`)

### 3.1 Enable email channel

Uncomment the email option in `CHANNELS`:

```js
const CHANNELS = [
  { id: "email",   label: "邮件" },
  { id: "browser", label: "浏览器推送" },
];
```

### 3.2 Email notification inline warning

When user selects "邮件" channel (either in the new-alert form or when patching an existing alert), check if `notifyEmail` is enabled via the existing `/api/console/me` endpoint.

Display an inline warning banner (yellow, same style as `PermBanner`) if `notifyEmail` is false:

> "邮件通知未开启。请前往 [账户设置](/dashboard/settings) 开启邮件通知后，邮件告警才会生效。"

This banner appears:
- In the new-alert form when `channel === "email"` and `notifyEmail === false`
- Below any existing alert row where `channel === "email"` and `notifyEmail === false`

### 3.3 Implementation details

- Fetch user profile once on mount via `/api/console/me` (likely already available in app context)
- Store `notifyEmail` in component state
- The warning is purely informational — does not block creation (user can enable later)

---

## Testing Strategy

### Backend unit tests

- `email-templates/alert-base.test.ts`: `wrapLayout()` returns valid HTML with header/footer
- `email-templates/alert-balance-low.test.ts` (and each kind): correct subject, HTML contains expected values, text fallback matches
- `email-templates/index.test.ts`: `renderAlertEmail()` dispatches correctly, throws on unknown kind

### Backend integration tests

- `alert-notifier.test.ts`: verify that when an email alert fires, `mailer.send()` receives `html` field (not just `text`)

### Frontend tests

- `Alerts.test.jsx`: email channel appears in dropdown, inline warning shows when `notifyEmail === false`, warning hidden when `notifyEmail === true`

---

## Out of Scope

- Webhook channel (remains commented out)
- Email verification flow
- User settings page changes (already exists)
- Alert history / delivery log UI
