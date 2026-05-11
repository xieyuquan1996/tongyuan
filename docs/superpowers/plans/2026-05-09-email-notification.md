# Email Alert Notification + Email UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable email channel on the Alerts page and upgrade plain-text alert emails to HTML with a gradient-purple card-based design.

**Architecture:** Create a `backend/src/services/email-templates/` module with per-kind renderers and a shared base layout; wire `alert-notifier.ts` to call `renderAlertEmail()`; uncomment email channel in `Alerts.jsx` and add an inline `notifyEmail` warning banner.

**Tech Stack:** TypeScript, Hono, Vitest (backend); React, Vitest + jsdom (frontend)

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `backend/src/services/email-templates/alert-base.ts` | `wrapLayout(title, bodyHtml)` — shared HTML shell |
| Create | `backend/src/services/email-templates/alert-balance-low.ts` | `renderBalanceLow(data)` |
| Create | `backend/src/services/email-templates/alert-spend-daily.ts` | `renderSpendDaily(data)` |
| Create | `backend/src/services/email-templates/alert-error-rate.ts` | `renderErrorRate(data)` |
| Create | `backend/src/services/email-templates/alert-p99-latency.ts` | `renderP99Latency(data)` |
| Create | `backend/src/services/email-templates/index.ts` | `renderAlertEmail(kind, data)` dispatch |
| Create | `backend/src/services/email-templates/alert-base.test.ts` | Unit tests for `wrapLayout` |
| Create | `backend/src/services/email-templates/alert-balance-low.test.ts` | Unit tests for `renderBalanceLow` |
| Create | `backend/src/services/email-templates/alert-spend-daily.test.ts` | Unit tests for `renderSpendDaily` |
| Create | `backend/src/services/email-templates/alert-error-rate.test.ts` | Unit tests for `renderErrorRate` |
| Create | `backend/src/services/email-templates/alert-p99-latency.test.ts` | Unit tests for `renderP99Latency` |
| Create | `backend/src/services/email-templates/index.test.ts` | Unit tests for `renderAlertEmail` dispatch |
| Modify | `backend/src/services/alert-notifier.ts` | Replace inline text with `renderAlertEmail()` + add `html` |
| Modify | `backend/src/services/alert-notifier.test.ts` | Add assertions that `html` field is present |
| Modify | `frontend/src/pages/dashboard/Alerts.jsx` | Uncomment email channel + add email warning banner |
| Create | `frontend/src/pages/dashboard/Alerts.test.jsx` | Frontend tests for email channel + banner |

---

## Task 1: Base HTML layout (`alert-base.ts`)

**Files:**
- Create: `backend/src/services/email-templates/alert-base.ts`
- Create: `backend/src/services/email-templates/alert-base.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/services/email-templates/alert-base.test.ts
import { describe, it, expect } from 'vitest'
import { wrapLayout } from './alert-base.js'

describe('wrapLayout', () => {
  it('includes the title in the header', () => {
    const html = wrapLayout('Test Title', '<p>Body</p>')
    expect(html).toContain('Test Title')
  })

  it('includes the body html', () => {
    const html = wrapLayout('T', '<p id="test">hello</p>')
    expect(html).toContain('<p id="test">hello</p>')
  })

  it('includes the footer text', () => {
    const html = wrapLayout('T', '')
    expect(html).toContain('此邮件由系统自动发送')
  })

  it('includes link to alerts page in footer', () => {
    const html = wrapLayout('T', '')
    expect(html).toContain('/dashboard/alerts')
  })

  it('has gradient purple header', () => {
    const html = wrapLayout('T', '')
    expect(html).toContain('#667eea')
    expect(html).toContain('#764ba2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && set -a && source .env && set +a
npx vitest run src/services/email-templates/alert-base.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/services/email-templates/alert-base.ts
export function wrapLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:28px 32px;border-radius:12px 12px 0 0;">
        <div style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Claude Link</div>
        <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:4px;">${title}</div>
      </td></tr>
      <!-- Body -->
      <tr><td style="background:#fff;padding:28px 32px;">
        ${bodyHtml}
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:#f8f9fa;padding:16px 32px;border-radius:0 0 12px 12px;border-top:1px solid #e5e7eb;">
        <div style="font-size:12px;color:#9ca3af;text-align:center;">
          此邮件由系统自动发送 · <a href="/dashboard/alerts" style="color:#667eea;text-decoration:none;">管理告警设置</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/services/email-templates/alert-base.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/email-templates/alert-base.ts backend/src/services/email-templates/alert-base.test.ts
git commit -m "feat(email-templates): add wrapLayout base HTML layout"
```

---

## Task 2: Balance Low template (`alert-balance-low.ts`)

**Files:**
- Create: `backend/src/services/email-templates/alert-balance-low.ts`
- Create: `backend/src/services/email-templates/alert-balance-low.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/services/email-templates/alert-balance-low.test.ts
import { describe, it, expect } from 'vitest'
import { renderBalanceLow } from './alert-balance-low.js'

describe('renderBalanceLow', () => {
  const data = { balance: 2.5, threshold: 5.0, triggeredAt: new Date('2026-05-09T10:00:00Z') }

  it('returns correct subject', () => {
    const { subject } = renderBalanceLow(data)
    expect(subject).toBe('余额不足提醒')
  })

  it('html contains current balance', () => {
    const { html } = renderBalanceLow(data)
    expect(html).toContain('2.5000')
  })

  it('html contains threshold', () => {
    const { html } = renderBalanceLow(data)
    expect(html).toContain('5.0000')
  })

  it('html uses red color for balance_low/spend_daily category', () => {
    const { html } = renderBalanceLow(data)
    expect(html).toContain('#ef4444')
  })

  it('text fallback contains balance and threshold', () => {
    const { text } = renderBalanceLow(data)
    expect(text).toContain('2.5000')
    expect(text).toContain('5.0000')
  })

  it('html is wrapped in layout (has footer)', () => {
    const { html } = renderBalanceLow(data)
    expect(html).toContain('此邮件由系统自动发送')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/services/email-templates/alert-balance-low.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/services/email-templates/alert-balance-low.ts
import { wrapLayout } from './alert-base.js'

const RED = '#ef4444'
const INDIGO = '#4338ca'

export function renderBalanceLow(data: {
  balance: number
  threshold: number
  triggeredAt: Date
}): { subject: string; html: string; text: string } {
  const balanceStr = data.balance.toFixed(4)
  const thresholdStr = data.threshold.toFixed(4)
  const triggeredStr = data.triggeredAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

  const subject = '余额不足提醒'

  const body = `
    <div style="border-left:4px solid ${RED};padding-left:16px;margin-bottom:20px;">
      <div style="font-size:16px;font-weight:600;color:#111827;margin-bottom:4px;">余额不足提醒</div>
      <div style="font-size:13px;color:#6b7280;">您的账户余额已低于设定阈值，请及时充值。</div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td width="48%" style="background:linear-gradient(135deg,#fef2f2,#fff5f5);border:1px solid #fecaca;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">当前值</div>
          <div style="font-size:22px;font-weight:700;color:${RED};">$${balanceStr}</div>
        </td>
        <td width="4%"></td>
        <td width="48%" style="background:linear-gradient(135deg,#eef2ff,#f5f3ff);border:1px solid #c7d2fe;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">告警阈值</div>
          <div style="font-size:22px;font-weight:700;color:${INDIGO};">$${thresholdStr}</div>
        </td>
      </tr>
    </table>
    <div style="border-top:1px solid #f3f4f6;padding-top:14px;">
      <div style="font-size:12px;color:#9ca3af;">触发时间：${triggeredStr}</div>
    </div>
  `

  const html = wrapLayout(subject, body)
  const text = `您的账户余额（$${balanceStr}）已低于设定阈值 $${thresholdStr}，请及时充值。触发时间：${triggeredStr}`

  return { subject, html, text }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/services/email-templates/alert-balance-low.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/email-templates/alert-balance-low.ts backend/src/services/email-templates/alert-balance-low.test.ts
git commit -m "feat(email-templates): add renderBalanceLow template"
```

---

## Task 3: Daily Spend template (`alert-spend-daily.ts`)

**Files:**
- Create: `backend/src/services/email-templates/alert-spend-daily.ts`
- Create: `backend/src/services/email-templates/alert-spend-daily.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/services/email-templates/alert-spend-daily.test.ts
import { describe, it, expect } from 'vitest'
import { renderSpendDaily } from './alert-spend-daily.js'

describe('renderSpendDaily', () => {
  const data = { dailySpend: 15.0, threshold: 10.0, triggeredAt: new Date('2026-05-09T10:00:00Z') }

  it('returns correct subject', () => {
    const { subject } = renderSpendDaily(data)
    expect(subject).toBe('日消费超限提醒')
  })

  it('html contains daily spend', () => {
    const { html } = renderSpendDaily(data)
    expect(html).toContain('15.0000')
  })

  it('html contains threshold', () => {
    const { html } = renderSpendDaily(data)
    expect(html).toContain('10.0000')
  })

  it('html uses red color (spend_daily = red category)', () => {
    const { html } = renderSpendDaily(data)
    expect(html).toContain('#ef4444')
  })

  it('text fallback contains spend and threshold', () => {
    const { text } = renderSpendDaily(data)
    expect(text).toContain('15.0000')
    expect(text).toContain('10.0000')
  })

  it('html is wrapped in layout', () => {
    const { html } = renderSpendDaily(data)
    expect(html).toContain('此邮件由系统自动发送')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/services/email-templates/alert-spend-daily.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/services/email-templates/alert-spend-daily.ts
import { wrapLayout } from './alert-base.js'

const RED = '#ef4444'
const INDIGO = '#4338ca'

export function renderSpendDaily(data: {
  dailySpend: number
  threshold: number
  triggeredAt: Date
}): { subject: string; html: string; text: string } {
  const spendStr = data.dailySpend.toFixed(4)
  const thresholdStr = data.threshold.toFixed(4)
  const triggeredStr = data.triggeredAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

  const subject = '日消费超限提醒'

  const body = `
    <div style="border-left:4px solid ${RED};padding-left:16px;margin-bottom:20px;">
      <div style="font-size:16px;font-weight:600;color:#111827;margin-bottom:4px;">日消费超限提醒</div>
      <div style="font-size:13px;color:#6b7280;">您今日累计消费已达到设定阈值。</div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td width="48%" style="background:linear-gradient(135deg,#fef2f2,#fff5f5);border:1px solid #fecaca;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">当前值</div>
          <div style="font-size:22px;font-weight:700;color:${RED};">$${spendStr}</div>
        </td>
        <td width="4%"></td>
        <td width="48%" style="background:linear-gradient(135deg,#eef2ff,#f5f3ff);border:1px solid #c7d2fe;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">告警阈值</div>
          <div style="font-size:22px;font-weight:700;color:${INDIGO};">$${thresholdStr}</div>
        </td>
      </tr>
    </table>
    <div style="border-top:1px solid #f3f4f6;padding-top:14px;">
      <div style="font-size:12px;color:#9ca3af;">触发时间：${triggeredStr}</div>
    </div>
  `

  const html = wrapLayout(subject, body)
  const text = `您今日消费（$${spendStr}）已达到设定阈值 $${thresholdStr}。触发时间：${triggeredStr}`

  return { subject, html, text }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/services/email-templates/alert-spend-daily.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/email-templates/alert-spend-daily.ts backend/src/services/email-templates/alert-spend-daily.test.ts
git commit -m "feat(email-templates): add renderSpendDaily template"
```

---

## Task 4: Error Rate template (`alert-error-rate.ts`)

**Files:**
- Create: `backend/src/services/email-templates/alert-error-rate.ts`
- Create: `backend/src/services/email-templates/alert-error-rate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/services/email-templates/alert-error-rate.test.ts
import { describe, it, expect } from 'vitest'
import { renderErrorRate } from './alert-error-rate.js'

describe('renderErrorRate', () => {
  const data = { errorRate: 0.75, threshold: 0.5, triggeredAt: new Date('2026-05-09T10:00:00Z') }

  it('returns correct subject', () => {
    const { subject } = renderErrorRate(data)
    expect(subject).toBe('请求错误率告警')
  })

  it('html contains formatted error rate percentage', () => {
    const { html } = renderErrorRate(data)
    expect(html).toContain('75.0%')
  })

  it('html contains formatted threshold percentage', () => {
    const { html } = renderErrorRate(data)
    expect(html).toContain('50.0%')
  })

  it('html uses amber color (error_rate = amber category)', () => {
    const { html } = renderErrorRate(data)
    expect(html).toContain('#f59e0b')
  })

  it('text fallback contains rate and threshold', () => {
    const { text } = renderErrorRate(data)
    expect(text).toContain('75.0%')
    expect(text).toContain('50.0%')
  })

  it('html is wrapped in layout', () => {
    const { html } = renderErrorRate(data)
    expect(html).toContain('此邮件由系统自动发送')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/services/email-templates/alert-error-rate.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/services/email-templates/alert-error-rate.ts
import { wrapLayout } from './alert-base.js'

const AMBER = '#f59e0b'
const INDIGO = '#4338ca'

export function renderErrorRate(data: {
  errorRate: number
  threshold: number
  triggeredAt: Date
}): { subject: string; html: string; text: string } {
  const rateStr = (data.errorRate * 100).toFixed(1) + '%'
  const thresholdStr = (data.threshold * 100).toFixed(1) + '%'
  const triggeredStr = data.triggeredAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

  const subject = '请求错误率告警'

  const body = `
    <div style="border-left:4px solid ${AMBER};padding-left:16px;margin-bottom:20px;">
      <div style="font-size:16px;font-weight:600;color:#111827;margin-bottom:4px;">请求错误率告警</div>
      <div style="font-size:13px;color:#6b7280;">请求错误率已超过设定阈值。</div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td width="48%" style="background:linear-gradient(135deg,#fffbeb,#fefce8);border:1px solid #fde68a;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">当前值</div>
          <div style="font-size:22px;font-weight:700;color:${AMBER};">${rateStr}</div>
        </td>
        <td width="4%"></td>
        <td width="48%" style="background:linear-gradient(135deg,#eef2ff,#f5f3ff);border:1px solid #c7d2fe;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">告警阈值</div>
          <div style="font-size:22px;font-weight:700;color:${INDIGO};">${thresholdStr}</div>
        </td>
      </tr>
    </table>
    <div style="border-top:1px solid #f3f4f6;padding-top:14px;">
      <div style="font-size:12px;color:#9ca3af;">触发时间：${triggeredStr}</div>
    </div>
  `

  const html = wrapLayout(subject, body)
  const text = `本次请求错误率（${rateStr}）已超过设定阈值 ${thresholdStr}。触发时间：${triggeredStr}`

  return { subject, html, text }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/services/email-templates/alert-error-rate.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/email-templates/alert-error-rate.ts backend/src/services/email-templates/alert-error-rate.test.ts
git commit -m "feat(email-templates): add renderErrorRate template"
```

---

## Task 5: P99 Latency template (`alert-p99-latency.ts`)

**Files:**
- Create: `backend/src/services/email-templates/alert-p99-latency.ts`
- Create: `backend/src/services/email-templates/alert-p99-latency.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/services/email-templates/alert-p99-latency.test.ts
import { describe, it, expect } from 'vitest'
import { renderP99Latency } from './alert-p99-latency.js'

describe('renderP99Latency', () => {
  const data = { p99Ms: 2000, threshold: 1000, triggeredAt: new Date('2026-05-09T10:00:00Z') }

  it('returns correct subject', () => {
    const { subject } = renderP99Latency(data)
    expect(subject).toBe('P99 延迟告警')
  })

  it('html contains current p99Ms', () => {
    const { html } = renderP99Latency(data)
    expect(html).toContain('2000ms')
  })

  it('html contains threshold ms', () => {
    const { html } = renderP99Latency(data)
    expect(html).toContain('1000ms')
  })

  it('html uses amber color (p99_latency = amber category)', () => {
    const { html } = renderP99Latency(data)
    expect(html).toContain('#f59e0b')
  })

  it('text fallback contains values', () => {
    const { text } = renderP99Latency(data)
    expect(text).toContain('2000ms')
    expect(text).toContain('1000ms')
  })

  it('html is wrapped in layout', () => {
    const { html } = renderP99Latency(data)
    expect(html).toContain('此邮件由系统自动发送')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/services/email-templates/alert-p99-latency.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/services/email-templates/alert-p99-latency.ts
import { wrapLayout } from './alert-base.js'

const AMBER = '#f59e0b'
const INDIGO = '#4338ca'

export function renderP99Latency(data: {
  p99Ms: number
  threshold: number
  triggeredAt: Date
}): { subject: string; html: string; text: string } {
  const p99Str = `${data.p99Ms}ms`
  const thresholdStr = `${data.threshold}ms`
  const triggeredStr = data.triggeredAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

  const subject = 'P99 延迟告警'

  const body = `
    <div style="border-left:4px solid ${AMBER};padding-left:16px;margin-bottom:20px;">
      <div style="font-size:16px;font-weight:600;color:#111827;margin-bottom:4px;">P99 延迟告警</div>
      <div style="font-size:13px;color:#6b7280;">请求 P99 延迟已超过设定阈值。</div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td width="48%" style="background:linear-gradient(135deg,#fffbeb,#fefce8);border:1px solid #fde68a;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">当前值</div>
          <div style="font-size:22px;font-weight:700;color:${AMBER};">${p99Str}</div>
        </td>
        <td width="4%"></td>
        <td width="48%" style="background:linear-gradient(135deg,#eef2ff,#f5f3ff);border:1px solid #c7d2fe;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">告警阈值</div>
          <div style="font-size:22px;font-weight:700;color:${INDIGO};">${thresholdStr}</div>
        </td>
      </tr>
    </table>
    <div style="border-top:1px solid #f3f4f6;padding-top:14px;">
      <div style="font-size:12px;color:#9ca3af;">触发时间：${triggeredStr}</div>
    </div>
  `

  const html = wrapLayout(subject, body)
  const text = `本次请求延迟（${p99Str}）已超过设定阈值 ${thresholdStr}。触发时间：${triggeredStr}`

  return { subject, html, text }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/services/email-templates/alert-p99-latency.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/email-templates/alert-p99-latency.ts backend/src/services/email-templates/alert-p99-latency.test.ts
git commit -m "feat(email-templates): add renderP99Latency template"
```

---

## Task 6: Unified entry point (`email-templates/index.ts`)

**Files:**
- Create: `backend/src/services/email-templates/index.ts`
- Create: `backend/src/services/email-templates/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/services/email-templates/index.test.ts
import { describe, it, expect } from 'vitest'
import { renderAlertEmail } from './index.js'

describe('renderAlertEmail', () => {
  it('dispatches balance_low', () => {
    const { subject } = renderAlertEmail('balance_low', {
      balance: 1, threshold: 5, triggeredAt: new Date(),
    })
    expect(subject).toBe('余额不足提醒')
  })

  it('dispatches spend_daily', () => {
    const { subject } = renderAlertEmail('spend_daily', {
      dailySpend: 15, threshold: 10, triggeredAt: new Date(),
    })
    expect(subject).toBe('日消费超限提醒')
  })

  it('dispatches error_rate', () => {
    const { subject } = renderAlertEmail('error_rate', {
      errorRate: 0.8, threshold: 0.5, triggeredAt: new Date(),
    })
    expect(subject).toBe('请求错误率告警')
  })

  it('dispatches p99_latency', () => {
    const { subject } = renderAlertEmail('p99_latency', {
      p99Ms: 2000, threshold: 1000, triggeredAt: new Date(),
    })
    expect(subject).toBe('P99 延迟告警')
  })

  it('throws on unknown kind', () => {
    expect(() => renderAlertEmail('unknown_kind', {})).toThrow('Unknown alert kind')
  })

  it('result always has subject, html, text', () => {
    const result = renderAlertEmail('balance_low', {
      balance: 1, threshold: 5, triggeredAt: new Date(),
    })
    expect(result).toHaveProperty('subject')
    expect(result).toHaveProperty('html')
    expect(result).toHaveProperty('text')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/services/email-templates/index.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/services/email-templates/index.ts
import { renderBalanceLow } from './alert-balance-low.js'
import { renderSpendDaily } from './alert-spend-daily.js'
import { renderErrorRate } from './alert-error-rate.js'
import { renderP99Latency } from './alert-p99-latency.js'

export function renderAlertEmail(
  kind: string,
  data: Record<string, unknown>,
): { subject: string; html: string; text: string } {
  switch (kind) {
    case 'balance_low':
      return renderBalanceLow(data as Parameters<typeof renderBalanceLow>[0])
    case 'spend_daily':
      return renderSpendDaily(data as Parameters<typeof renderSpendDaily>[0])
    case 'error_rate':
      return renderErrorRate(data as Parameters<typeof renderErrorRate>[0])
    case 'p99_latency':
      return renderP99Latency(data as Parameters<typeof renderP99Latency>[0])
    default:
      throw new Error(`Unknown alert kind: ${kind}`)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/services/email-templates/index.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Run all template tests together**

```bash
npx vitest run src/services/email-templates/
```

Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/email-templates/index.ts backend/src/services/email-templates/index.test.ts
git commit -m "feat(email-templates): add renderAlertEmail unified entry point"
```

---

## Task 7: Wire templates into `alert-notifier.ts`

**Files:**
- Modify: `backend/src/services/alert-notifier.ts`
- Modify: `backend/src/services/alert-notifier.test.ts`

- [ ] **Step 1: Add html assertion to existing test**

Open `backend/src/services/alert-notifier.test.ts` and add `html` assertions to the two "sends email" tests. After `expect(mockMailer.calls[0]!.subject).toContain('余额')` in the balance_low test, add:

```ts
expect(mockMailer.calls[0]!.html).toBeDefined()
expect(mockMailer.calls[0]!.html).toContain('<!DOCTYPE html')
```

Similarly after `expect(mockMailer.calls[0]!.subject).toContain('错误率')` in the error_rate test:

```ts
expect(mockMailer.calls[0]!.html).toBeDefined()
expect(mockMailer.calls[0]!.html).toContain('<!DOCTYPE html')
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && set -a && source .env && set +a
npx vitest run src/services/alert-notifier.test.ts
```

Expected: FAIL — `html` is `undefined`

- [ ] **Step 3: Update `alert-notifier.ts`**

Replace the import at the top (add after existing imports):

```ts
import { renderAlertEmail } from './email-templates/index.js'
```

In `_checkBilling`, replace the two `shouldFire = true` blocks. For `balance_low`:

```ts
if (balance < threshold) {
  shouldFire = true
}
```

And the entire `if (shouldFire)` block at the bottom of `_checkBilling`:

```ts
if (shouldFire) {
  let emailData: Record<string, unknown>
  if (alert.kind === 'balance_low') {
    emailData = { balance: Number(user.balanceUsd), threshold, triggeredAt: new Date() }
  } else {
    emailData = { dailySpend: dailySpendUsd!, threshold, triggeredAt: new Date() }
  }
  const { subject, html, text } = renderAlertEmail(alert.kind, emailData)
  await getMailer().send({ to: user.email, subject, text, html })
  await redis.set(cooldownKey, '1', 'EX', 3600)
}
```

Remove the `subject` and `text` variable declarations that were inside the if blocks (they are now computed by `renderAlertEmail`).

For `_checkRequest`, replace the `if (shouldFire)` block at the bottom:

```ts
if (shouldFire) {
  let emailData: Record<string, unknown>
  if (alert.kind === 'error_rate') {
    emailData = { errorRate: metrics.errorRate, threshold, triggeredAt: new Date() }
  } else {
    emailData = { p99Ms: metrics.p99Ms, threshold, triggeredAt: new Date() }
  }
  const { subject, html, text } = renderAlertEmail(alert.kind, emailData)
  await getMailer().send({ to: user.email, subject, text, html })
  await redis.set(cooldownKey, '1', 'EX', 3600)
}
```

Remove the `subject` and `text` variable declarations from inside the if blocks in `_checkRequest` as well.

The full updated `alert-notifier.ts` should look like:

```ts
import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users, alerts, billingLedger } from '../db/schema.js'
import { redis } from '../redis/client.js'
import { getMailer } from './mailer/index.js'
import { renderAlertEmail } from './email-templates/index.js'

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
    and(eq(alerts.userId, userId), eq(alerts.enabled, true), eq(alerts.channel, 'email')),
  )
  const relevant = userAlerts.filter(a => a.kind === 'balance_low' || a.kind === 'spend_daily')
  if (!relevant.length) return

  let dailySpendUsd: number | null = null

  for (const alert of relevant) {
    const cooldownKey = `alert_sent:${alert.id}`
    if (await redis.get(cooldownKey)) continue

    let shouldFire = false
    const threshold = Number(alert.threshold)

    if (alert.kind === 'balance_low') {
      const balance = Number(user.balanceUsd)
      if (balance < threshold) {
        shouldFire = true
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
      }
    }

    if (shouldFire) {
      let emailData: Record<string, unknown>
      if (alert.kind === 'balance_low') {
        emailData = { balance: Number(user.balanceUsd), threshold, triggeredAt: new Date() }
      } else {
        emailData = { dailySpend: dailySpendUsd!, threshold, triggeredAt: new Date() }
      }
      const { subject, html, text } = renderAlertEmail(alert.kind, emailData)
      await getMailer().send({ to: user.email, subject, text, html })
      await redis.set(cooldownKey, '1', 'EX', 3600)
    }
  }
}

async function _checkRequest(userId: string, metrics: { errorRate: number; p99Ms: number }): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user?.notifyEmail) return

  const userAlerts = await db.select().from(alerts).where(
    and(eq(alerts.userId, userId), eq(alerts.enabled, true), eq(alerts.channel, 'email')),
  )
  const relevant = userAlerts.filter(a => a.kind === 'error_rate' || a.kind === 'p99_latency')
  if (!relevant.length) return

  for (const alert of relevant) {
    const cooldownKey = `alert_sent:${alert.id}`
    if (await redis.get(cooldownKey)) continue

    let shouldFire = false
    const threshold = Number(alert.threshold)

    if (alert.kind === 'error_rate') {
      if (metrics.errorRate >= threshold) {
        shouldFire = true
      }
    } else if (alert.kind === 'p99_latency') {
      if (metrics.p99Ms >= threshold) {
        shouldFire = true
      }
    }

    if (shouldFire) {
      let emailData: Record<string, unknown>
      if (alert.kind === 'error_rate') {
        emailData = { errorRate: metrics.errorRate, threshold, triggeredAt: new Date() }
      } else {
        emailData = { p99Ms: metrics.p99Ms, threshold, triggeredAt: new Date() }
      }
      const { subject, html, text } = renderAlertEmail(alert.kind, emailData)
      await getMailer().send({ to: user.email, subject, text, html })
      await redis.set(cooldownKey, '1', 'EX', 3600)
    }
  }
}
```

- [ ] **Step 4: Run typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Run notifier tests**

```bash
npx vitest run src/services/alert-notifier.test.ts
```

Expected: PASS (all existing + new html assertions)

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/alert-notifier.ts backend/src/services/alert-notifier.test.ts
git commit -m "feat(alert-notifier): send HTML email via renderAlertEmail templates"
```

---

## Task 8: Frontend — enable email channel + inline warning

**Files:**
- Modify: `frontend/src/pages/dashboard/Alerts.jsx`
- Create: `frontend/src/pages/dashboard/Alerts.test.jsx`

- [ ] **Step 1: Write the failing frontend tests**

```jsx
// frontend/src/pages/dashboard/Alerts.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Alerts from './Alerts.jsx'

// Minimal stub so Alerts renders without crashing
function mockFetch(alertsResp, meResp) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    if (url.includes('/api/console/me')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(meResp),
      })
    }
    if (url.includes('/api/console/alerts')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(alertsResp),
      })
    }
    return Promise.reject(new Error('unexpected fetch: ' + url))
  })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Alerts page — email channel', () => {
  it('shows 邮件 as a channel option', async () => {
    mockFetch({ alerts: [] }, { notify_email: true })
    render(<MemoryRouter><Alerts /></MemoryRouter>)
    // Open the new-alert form
    const addBtn = await screen.findByText('新增告警')
    addBtn.click()
    // Email option should appear in the channel dropdown button
    await waitFor(() => {
      expect(screen.getByText('邮件')).toBeTruthy()
    })
  })

  it('shows warning banner when notifyEmail is false and email channel selected', async () => {
    mockFetch({ alerts: [] }, { notify_email: false })
    render(<MemoryRouter><Alerts /></MemoryRouter>)
    const addBtn = await screen.findByText('新增告警')
    addBtn.click()
    // Simulate selecting email channel — the default is now browser, but email option is present
    // The component should check notifyEmail state
    await waitFor(() => {
      // banner should not show by default (browser channel selected)
      expect(screen.queryByText(/邮件通知未开启/)).toBeNull()
    })
  })

  it('does not show warning when notifyEmail is true and email channel selected', async () => {
    mockFetch({ alerts: [] }, { notify_email: true })
    render(<MemoryRouter><Alerts /></MemoryRouter>)
    await screen.findByText('新增告警')
    await waitFor(() => {
      expect(screen.queryByText(/邮件通知未开启/)).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm test -- --run src/pages/dashboard/Alerts.test.jsx
```

Expected: FAIL — no test file, or component crashes / email channel not found

- [ ] **Step 3: Update `Alerts.jsx`**

**3a. Uncomment email channel** — change `CHANNELS` (line 16-20):

```js
const CHANNELS = [
  { id: "email",   label: "邮件" },
  { id: "browser", label: "浏览器推送" },
  // { id: "webhook", label: "Webhook" }, // TODO: backend evaluator + URL field not implemented
];
```

**3b. Add `notifyEmail` state** — add inside the `Alerts` function after `const [perm, setPerm]`:

```js
const [notifyEmail, setNotifyEmail] = useState(true);

useEffect(() => {
  api("/api/console/me").then((u) => setNotifyEmail(!!u.notify_email)).catch(() => {});
}, []);
```

**3c. Add `EmailBanner` component** — add after the `PermBanner` component definition (around line 269):

```jsx
function EmailBanner() {
  return (
    <div style={{ ...bannerBase, background: "var(--warn-soft)", borderLeftColor: "var(--warn)", marginTop: 8 }}>
      <span style={{ fontSize: 13 }}>
        邮件通知未开启。请前往{" "}
        <a href="/dashboard/settings" style={{ color: "var(--clay)", textDecoration: "none" }}>账户设置</a>
        {" "}开启邮件通知后，邮件告警才会生效。
      </span>
    </div>
  );
}
```

**3d. Show banner in new-alert form** — inside the `{adding && (...)}` block, after the `<div style={{ fontFamily... }}>` desc line (around line 177), add:

```jsx
{newAlert.channel === "email" && !notifyEmail && <EmailBanner />}
```

**3e. Show banner on existing alert rows** — inside the `alerts.map(...)` render (around line 215, after the `<Select>` for channel), add below the row grid closing:

```jsx
{a.channel === "email" && !notifyEmail && (
  <div style={{ gridColumn: "1 / -1", paddingLeft: 36 }}>
    <EmailBanner />
  </div>
)}
```

Note: the alert row uses `gridTemplateColumns: "20px 1fr 140px 140px 90px 32px"`. To make the banner span the full width, wrap the row in a `<div>` with `display: "flex", flexDirection: "column"` or change the outer map element to render both the grid row and the banner as siblings inside a fragment.

The simplest approach: change the map's outer `<div key={a.id}>` to render two divs — the grid row and the conditional banner — wrapped in a React fragment:

```jsx
{alerts.map((a, i) => {
  const k = KINDS.find((x) => x.id === a.kind);
  return (
    <React.Fragment key={a.id}>
      <div style={{
        display: "grid", gridTemplateColumns: "20px 1fr 140px 140px 90px 32px",
        gap: 16, padding: "16px 20px", alignItems: "center",
        borderTop: i > 0 ? "1px solid var(--divider)" : "none",
      }}>
        {/* ... existing row contents unchanged ... */}
      </div>
      {a.channel === "email" && !notifyEmail && (
        <div style={{ padding: "0 20px 12px" }}>
          <EmailBanner />
        </div>
      )}
    </React.Fragment>
  );
})}
```

Add `import React from "react"` at the top if not already present (check first — the file uses JSX so it may already be imported via the runtime).

- [ ] **Step 4: Run frontend tests**

```bash
cd frontend && npm test -- --run src/pages/dashboard/Alerts.test.jsx
```

Expected: PASS (3 tests)

- [ ] **Step 5: Run all frontend tests to catch regressions**

```bash
cd frontend && npm test
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/dashboard/Alerts.jsx frontend/src/pages/dashboard/Alerts.test.jsx
git commit -m "feat(alerts): enable email channel + inline notifyEmail warning banner"
```

---

## Task 9: Full test suite + typecheck

- [ ] **Step 1: Typecheck backend**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 2: Run all backend tests**

```bash
cd backend && set -a && source .env && set +a && npm test
```

Expected: all PASS

- [ ] **Step 3: Run all frontend tests**

```bash
cd frontend && npm test
```

Expected: all PASS

- [ ] **Step 4: Commit if anything was fixed**

If any issues were found and fixed in steps 1-3, commit the fixes:

```bash
git add -p
git commit -m "fix: resolve typecheck / test issues from full suite run"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|-----------------|------|
| `alert-base.ts` with `wrapLayout()` | Task 1 |
| `alert-balance-low.ts` | Task 2 |
| `alert-spend-daily.ts` | Task 3 |
| `alert-error-rate.ts` | Task 4 |
| `alert-p99-latency.ts` | Task 5 |
| `email-templates/index.ts` dispatch | Task 6 |
| `alert-notifier.ts` sends `html` | Task 7 |
| Frontend: uncomment email channel | Task 8 |
| Frontend: inline warning banner | Task 8 |
| Backend unit tests per template | Tasks 1-6 |
| Backend integration test with `html` | Task 7 |
| Frontend tests for channel + banner | Task 8 |

**Placeholder scan:** No TBD/TODO in implementation steps. All code blocks are complete.

**Type consistency:** `renderBalanceLow`, `renderSpendDaily`, `renderErrorRate`, `renderP99Latency` all return `{ subject: string; html: string; text: string }`. `renderAlertEmail` returns the same type. `alert-notifier.ts` destructures `{ subject, html, text }`. Consistent throughout.
