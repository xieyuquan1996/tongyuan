# Maple Ledger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Cloudflare Pages app for tracking MapleLink operating revenue/expenses and calculating CAD-based profit, including exchange rate loss analysis.

**Architecture:** React + Vite frontend on Cloudflare Pages, Hono Pages Functions as API backend, Cloudflare D1 (SQLite) as database via Drizzle ORM, Cloudflare Access for zero-code authentication. Exchange rates fetched from a free API and cached in D1.

**Tech Stack:** React 18, Vite, TailwindCSS, Hono, Drizzle ORM, Cloudflare D1, Cloudflare Pages Functions, Wrangler CLI, Vitest

---

## File Map

| Status | File | Role |
|--------|------|------|
| **Create** | `maple-ledger/` | Project root |
| **Create** | `maple-ledger/package.json` | Dependencies + scripts |
| **Create** | `maple-ledger/vite.config.ts` | Vite config |
| **Create** | `maple-ledger/wrangler.toml` | D1 binding + Pages config |
| **Create** | `maple-ledger/tailwind.config.js` | Tailwind config |
| **Create** | `maple-ledger/tsconfig.json` | TypeScript config |
| **Create** | `maple-ledger/db/schema.ts` | Drizzle schema — transactions table |
| **Create** | `maple-ledger/db/migrations/0001_init.sql` | Initial D1 migration |
| **Create** | `maple-ledger/functions/api/_middleware.ts` | Auth header extraction |
| **Create** | `maple-ledger/functions/api/exchange-rate.ts` | GET /api/exchange-rate |
| **Create** | `maple-ledger/functions/api/transactions.ts` | GET/POST /api/transactions |
| **Create** | `maple-ledger/functions/api/transactions/[id].ts` | PUT/DELETE /api/transactions/:id |
| **Create** | `maple-ledger/functions/api/reports/monthly.ts` | GET /api/reports/monthly |
| **Create** | `maple-ledger/functions/api/reports/exchange-loss.ts` | GET /api/reports/exchange-loss |
| **Create** | `maple-ledger/src/lib/api.ts` | Fetch wrapper |
| **Create** | `maple-ledger/src/lib/api.test.ts` | Unit test for api wrapper |
| **Create** | `maple-ledger/src/components/Layout.tsx` | App shell + nav |
| **Create** | `maple-ledger/src/components/SummaryCards.tsx` | Monthly KPI cards |
| **Create** | `maple-ledger/src/components/TransactionForm.tsx` | New/edit transaction modal |
| **Create** | `maple-ledger/src/components/TransactionForm.test.tsx` | Component test |
| **Create** | `maple-ledger/src/pages/Transactions.tsx` | Transaction list page |
| **Create** | `maple-ledger/src/pages/MonthlyReport.tsx` | Monthly report page |
| **Create** | `maple-ledger/src/pages/ExchangeLoss.tsx` | Exchange loss analysis page |
| **Create** | `maple-ledger/src/main.tsx` | React entry + router |

---

## Task 1: Project scaffold

**Files:**
- Create: `maple-ledger/package.json`
- Create: `maple-ledger/vite.config.ts`
- Create: `maple-ledger/wrangler.toml`
- Create: `maple-ledger/tailwind.config.js`
- Create: `maple-ledger/tsconfig.json`

- [ ] **Step 1: Create project root**

```bash
mkdir -p maple-ledger/src/{lib,components,pages} maple-ledger/functions/api/{reports,transactions} maple-ledger/db/migrations maple-ledger/scripts
```

- [ ] **Step 2: Create package.json**

Create `maple-ledger/package.json`:
```json
{
  "name": "maple-ledger",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "db:migrate": "wrangler d1 execute maple-ledger --file=db/migrations/0001_init.sql",
    "db:migrate:local": "wrangler d1 execute maple-ledger --local --file=db/migrations/0001_init.sql"
  },
  "dependencies": {
    "@cloudflare/workers-types": "^4.20240529.0",
    "drizzle-orm": "^0.30.10",
    "hono": "^4.3.0",
    "nanoid": "^5.0.7",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.23.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.19",
    "drizzle-kit": "^0.21.4",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.5",
    "vite": "^5.2.12",
    "vitest": "^1.6.0",
    "@testing-library/react": "^15.0.7",
    "@testing-library/jest-dom": "^6.4.5",
    "jsdom": "^24.1.0"
  }
}
```

- [ ] **Step 3: Create vite.config.ts**

Create `maple-ledger/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    globals: true,
  },
})
```

- [ ] **Step 4: Create wrangler.toml**

Create `maple-ledger/wrangler.toml`:
```toml
name = "maple-ledger"
compatibility_date = "2024-05-29"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"
database_name = "maple-ledger"
database_id = "REPLACE_WITH_ACTUAL_D1_ID"
```

- [ ] **Step 5: Create tailwind.config.js**

Create `maple-ledger/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 6: Create tsconfig.json**

Create `maple-ledger/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "functions", "db"]
}
```

- [ ] **Step 7: Create test setup**

Create `maple-ledger/src/test-setup.ts`:
```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 8: Install dependencies**

```bash
cd maple-ledger && npm install
```

- [ ] **Step 9: Commit**

```bash
git add maple-ledger/
git commit -m "chore(maple-ledger): scaffold project with Vite + React + Hono + Drizzle + Wrangler"
```

---

## Task 2: Database schema + migration

**Files:**
- Create: `maple-ledger/db/schema.ts`
- Create: `maple-ledger/db/migrations/0001_init.sql`

- [ ] **Step 1: Create Drizzle schema**

Create `maple-ledger/db/schema.ts`:
```ts
import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['income', 'expense'] }).notNull(),
  date: text('date').notNull(),
  amount: real('amount').notNull(),
  currency: text('currency').notNull(),
  usdRmbRate: real('usd_rmb_rate'),
  cadUsdMarketRate: real('cad_usd_market_rate'),
  amountCad: real('amount_cad').notNull(),
  note: text('note'),
  category: text('category', { enum: ['api_topup', 'user_payment', 'server', 'other'] }).notNull(),
  tax: real('tax'),
  bankRate: real('bank_rate'),
  marketRateAtPurchase: real('market_rate_at_purchase'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
})

export const exchangeRateCache = sqliteTable('exchange_rate_cache', {
  pair: text('pair').primaryKey(),
  rate: real('rate').notNull(),
  date: text('date').notNull(),
  fetchedAt: text('fetched_at').default(sql`(datetime('now'))`).notNull(),
})
```

- [ ] **Step 2: Create migration SQL**

Create `maple-ledger/db/migrations/0001_init.sql`:
```sql
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  usd_rmb_rate REAL,
  cad_usd_market_rate REAL,
  amount_cad REAL NOT NULL,
  note TEXT,
  category TEXT NOT NULL CHECK (category IN ('api_topup', 'user_payment', 'server', 'other')),
  tax REAL,
  bank_rate REAL,
  market_rate_at_purchase REAL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exchange_rate_cache (
  pair TEXT PRIMARY KEY,
  rate REAL NOT NULL,
  date TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
```

- [ ] **Step 3: Apply migration to local D1**

```bash
cd maple-ledger && npm run db:migrate:local
```

- [ ] **Step 4: Commit**

```bash
git add maple-ledger/db/
git commit -m "feat(maple-ledger): add D1 schema — transactions + exchange_rate_cache tables"
```

---

## Task 3: Exchange rate API

**Files:**
- Create: `maple-ledger/functions/api/exchange-rate.ts`
- Create: `maple-ledger/functions/api/_middleware.ts`

Note: Pages Functions don't have a test harness in the same way as Hono — integration tests require Wrangler's local dev or a deployed instance. We write a unit-testable helper and test that separately; the route itself is thin glue.

- [ ] **Step 1: Create auth middleware**

Create `maple-ledger/functions/api/_middleware.ts`:
```ts
import type { EventContext } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
}

export interface AppLocals {
  userEmail: string
}

export const onRequest = [
  async (ctx: EventContext<Env, string, AppLocals>) => {
    const email = ctx.request.headers.get('Cf-Access-Authenticated-User-Email') ?? 'dev@local'
    ctx.data.userEmail = email
    return ctx.next()
  },
]
```

- [ ] **Step 2: Create exchange rate helper + route**

Create `maple-ledger/functions/api/exchange-rate.ts`:
```ts
import type { EventContext } from '@cloudflare/workers-types'
import type { Env } from './_middleware.js'

const CACHE_TTL_SECONDS = 3600

export async function fetchCadUsdRate(db: D1Database, pair = 'CAD_USD'): Promise<{ rate: number; date: string; source: string }> {
  const today = new Date().toISOString().slice(0, 10)

  const cached = await db.prepare(
    'SELECT rate, date FROM exchange_rate_cache WHERE pair = ? AND date = ?'
  ).bind(pair, today).first<{ rate: number; date: string }>()

  if (cached) return { rate: cached.rate, date: cached.date, source: 'cache' }

  const res = await fetch(`https://open.er-api.com/v6/latest/CAD`)
  if (!res.ok) throw new Error(`exchange rate fetch failed: ${res.status}`)
  const data = await res.json() as { rates: Record<string, number>; date: string }
  const rate = data.rates['USD']
  if (!rate) throw new Error('CAD/USD rate not found in response')

  await db.prepare(
    'INSERT OR REPLACE INTO exchange_rate_cache (pair, rate, date) VALUES (?, ?, ?)'
  ).bind(pair, rate, today).run()

  return { rate, date: today, source: 'api' }
}

export const onRequestGet = async (ctx: EventContext<Env, string, Record<string, string>>) => {
  try {
    const result = await fetchCadUsdRate(ctx.env.DB)
    return Response.json(result)
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 3: Write unit test for fetchCadUsdRate helper logic**

Create `maple-ledger/src/lib/exchange-rate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('CAD/USD rate calculation', () => {
  it('amount_cad formula: amount / usd_rmb_rate * cad_usd_rate', () => {
    const rmb = 720
    const usdRmb = 7.2
    const cadUsd = 0.74
    const amountCad = rmb / usdRmb * cadUsd
    expect(amountCad).toBeCloseTo(73.98, 2)
  })

  it('expense amount_cad equals amount directly', () => {
    const amountCad = 50.00
    expect(amountCad).toBe(50.00)
  })
})
```

- [ ] **Step 4: Run test**

```bash
cd maple-ledger && npm test
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add maple-ledger/functions/api/
git commit -m "feat(maple-ledger): add exchange rate API with D1 cache + auth middleware"
```

---

## Task 4: Transactions CRUD API

**Files:**
- Create: `maple-ledger/functions/api/transactions.ts`
- Create: `maple-ledger/functions/api/transactions/[id].ts`

- [ ] **Step 1: Create transactions list + create route**

Create `maple-ledger/functions/api/transactions.ts`:
```ts
import type { EventContext } from '@cloudflare/workers-types'
import { nanoid } from 'nanoid'
import type { Env, AppLocals } from './_middleware.js'

function calcAmountCad(type: string, amount: number, usdRmbRate: number | null, cadUsdRate: number | null): number {
  if (type === 'expense') return amount
  if (!usdRmbRate || !cadUsdRate) throw new Error('income requires usd_rmb_rate and cad_usd_market_rate')
  return amount / usdRmbRate * cadUsdRate
}

export const onRequestGet = async (ctx: EventContext<Env, string, AppLocals>) => {
  const url = new URL(ctx.request.url)
  const month = url.searchParams.get('month')
  const type = url.searchParams.get('type')
  const category = url.searchParams.get('category')

  let query = 'SELECT * FROM transactions WHERE 1=1'
  const params: string[] = []

  if (month) {
    query += ' AND date LIKE ?'
    params.push(`${month}%`)
  }
  if (type) {
    query += ' AND type = ?'
    params.push(type)
  }
  if (category) {
    query += ' AND category = ?'
    params.push(category)
  }
  query += ' ORDER BY date DESC, created_at DESC'

  const rows = await ctx.env.DB.prepare(query).bind(...params).all()
  return Response.json(rows.results)
}

export const onRequestPost = async (ctx: EventContext<Env, string, AppLocals>) => {
  const body = await ctx.request.json() as {
    type: string; date: string; amount: number; currency: string
    usdRmbRate?: number; cadUsdMarketRate?: number; note?: string
    category: string; tax?: number; bankRate?: number; marketRateAtPurchase?: number
  }

  let amountCad: number
  try {
    amountCad = calcAmountCad(body.type, body.amount, body.usdRmbRate ?? null, body.cadUsdMarketRate ?? null)
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 400 })
  }

  const id = nanoid()
  await ctx.env.DB.prepare(`
    INSERT INTO transactions
      (id, type, date, amount, currency, usd_rmb_rate, cad_usd_market_rate, amount_cad,
       note, category, tax, bank_rate, market_rate_at_purchase, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.type, body.date, body.amount, body.currency,
    body.usdRmbRate ?? null, body.cadUsdMarketRate ?? null, amountCad,
    body.note ?? null, body.category,
    body.tax ?? null, body.bankRate ?? null, body.marketRateAtPurchase ?? null,
    ctx.data.userEmail,
  ).run()

  const row = await ctx.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first()
  return Response.json(row, { status: 201 })
}
```

- [ ] **Step 2: Create transaction detail route (PUT/DELETE)**

Create `maple-ledger/functions/api/transactions/[id].ts`:
```ts
import type { EventContext } from '@cloudflare/workers-types'
import type { Env, AppLocals } from '../_middleware.js'

export const onRequestPut = async (ctx: EventContext<Env, string, AppLocals>) => {
  const id = ctx.params['id'] as string
  const body = await ctx.request.json() as Record<string, unknown>

  const existing = await ctx.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first()
  if (!existing) return Response.json({ error: 'not_found' }, { status: 404 })

  const fields: string[] = []
  const vals: unknown[] = []

  const allowed = ['type','date','amount','currency','usd_rmb_rate','cad_usd_market_rate',
    'amount_cad','note','category','tax','bank_rate','market_rate_at_purchase']
  for (const key of allowed) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    if (camel in body || key in body) {
      fields.push(`${key} = ?`)
      vals.push((body as Record<string, unknown>)[camel] ?? (body as Record<string, unknown>)[key] ?? null)
    }
  }

  if (!fields.length) return Response.json({ error: 'no fields to update' }, { status: 400 })

  fields.push('updated_at = datetime(\'now\')')
  vals.push(id)

  await ctx.env.DB.prepare(`UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run()

  const row = await ctx.env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first()
  return Response.json(row)
}

export const onRequestDelete = async (ctx: EventContext<Env, string, AppLocals>) => {
  const id = ctx.params['id'] as string
  const existing = await ctx.env.DB.prepare('SELECT id FROM transactions WHERE id = ?').bind(id).first()
  if (!existing) return Response.json({ error: 'not_found' }, { status: 404 })

  await ctx.env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run()
  return new Response(null, { status: 204 })
}
```

- [ ] **Step 3: Commit**

```bash
git add maple-ledger/functions/api/transactions.ts maple-ledger/functions/api/transactions/
git commit -m "feat(maple-ledger): add transactions CRUD API (GET/POST/PUT/DELETE)"
```

---

## Task 5: Reports API

**Files:**
- Create: `maple-ledger/functions/api/reports/monthly.ts`
- Create: `maple-ledger/functions/api/reports/exchange-loss.ts`

- [ ] **Step 1: Create monthly report route**

Create `maple-ledger/functions/api/reports/monthly.ts`:
```ts
import type { EventContext } from '@cloudflare/workers-types'
import type { Env } from '../_middleware.js'

export const onRequestGet = async (ctx: EventContext<Env, string, Record<string, string>>) => {
  const url = new URL(ctx.request.url)
  const month = url.searchParams.get('month') ?? new Date().toISOString().slice(0, 7)

  const rows = await ctx.env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) AS income_rmb,
      COALESCE(SUM(CASE WHEN type='income' THEN amount_cad ELSE 0 END), 0) AS income_cad,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount_cad ELSE 0 END), 0) AS expense_cad,
      COUNT(*) AS tx_count
    FROM transactions
    WHERE date LIKE ?
  `).bind(`${month}%`).first<{
    income_rmb: number; income_cad: number; expense_cad: number; tx_count: number
  }>()

  const income_cad = rows?.income_cad ?? 0
  const expense_cad = rows?.expense_cad ?? 0
  const profit_cad = income_cad - expense_cad

  return Response.json({
    month,
    income_rmb: rows?.income_rmb ?? 0,
    income_cad,
    expense_cad,
    profit_cad,
    tx_count: rows?.tx_count ?? 0,
  })
}
```

- [ ] **Step 2: Create exchange loss report route**

Create `maple-ledger/functions/api/reports/exchange-loss.ts`:
```ts
import type { EventContext } from '@cloudflare/workers-types'
import type { Env } from '../_middleware.js'

export const onRequestGet = async (ctx: EventContext<Env, string, Record<string, string>>) => {
  const url = new URL(ctx.request.url)
  const from = url.searchParams.get('from') ?? '2000-01-01'
  const to = url.searchParams.get('to') ?? '2999-12-31'

  const rows = await ctx.env.DB.prepare(`
    SELECT id, date, amount, bank_rate, market_rate_at_purchase,
      (amount - (amount / bank_rate) * market_rate_at_purchase) AS loss_cad,
      ((bank_rate - market_rate_at_purchase) / market_rate_at_purchase * 100) AS loss_pct
    FROM transactions
    WHERE type = 'expense'
      AND bank_rate IS NOT NULL
      AND market_rate_at_purchase IS NOT NULL
      AND date BETWEEN ? AND ?
    ORDER BY date DESC
  `).bind(from, to).all<{
    id: string; date: string; amount: number; bank_rate: number
    market_rate_at_purchase: number; loss_cad: number; loss_pct: number
  }>()

  const records = rows.results
  const total_loss_cad = records.reduce((s, r) => s + r.loss_cad, 0)
  const avg_loss_pct = records.length > 0
    ? records.reduce((s, r) => s + r.loss_pct, 0) / records.length
    : 0

  return Response.json({ total_loss_cad, avg_loss_pct, records })
}
```

- [ ] **Step 3: Write unit tests for report calculation logic**

Create `maple-ledger/src/lib/reports.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('exchange loss calculation', () => {
  it('calculates loss_cad correctly', () => {
    const amount = 1000
    const bankRate = 0.72
    const marketRate = 0.74
    const lossCad = amount - (amount / bankRate) * marketRate
    expect(lossCad).toBeCloseTo(-27.78, 1)
  })

  it('calculates loss_pct correctly', () => {
    const bankRate = 0.72
    const marketRate = 0.74
    const lossPct = (bankRate - marketRate) / marketRate * 100
    expect(lossPct).toBeCloseTo(-2.70, 1)
  })
})

describe('monthly profit', () => {
  it('profit = income_cad - expense_cad', () => {
    const income_cad = 150.5
    const expense_cad = 100.0
    expect(income_cad - expense_cad).toBeCloseTo(50.5, 2)
  })
})
```

- [ ] **Step 4: Run tests**

```bash
cd maple-ledger && npm test
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add maple-ledger/functions/api/reports/ maple-ledger/src/lib/reports.test.ts
git commit -m "feat(maple-ledger): add monthly report and exchange loss report APIs"
```

---

## Task 6: Frontend API client

**Files:**
- Create: `maple-ledger/src/lib/api.ts`
- Create: `maple-ledger/src/lib/api.test.ts`

- [ ] **Step 1: Write failing test**

Create `maple-ledger/src/lib/api.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api } from './api.js'

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch')
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('api()', () => {
  it('calls fetch with correct path and returns json', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: '1' }]), { status: 200 })
    )
    const result = await api<{ id: string }[]>('/api/transactions')
    expect(fetch).toHaveBeenCalledWith('/api/transactions', expect.any(Object))
    expect(result).toEqual([{ id: '1' }])
  })

  it('throws on non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'not_found' }), { status: 404 })
    )
    await expect(api('/api/transactions/bad')).rejects.toThrow()
  })

  it('sends POST body as JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'new' }), { status: 201 })
    )
    await api('/api/transactions', { method: 'POST', body: { amount: 100 } })
    expect(fetch).toHaveBeenCalledWith('/api/transactions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ amount: 100 }),
    }))
  })
})
```

- [ ] **Step 2: Run test to see it fail**

```bash
cd maple-ledger && npm test src/lib/api.test.ts
```
Expected: FAIL — `Cannot find module './api.js'`

- [ ] **Step 3: Create api.ts**

Create `maple-ledger/src/lib/api.ts`:
```ts
export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string }
    throw new Error(err.error ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
```

- [ ] **Step 4: Run test to see it pass**

```bash
cd maple-ledger && npm test src/lib/api.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add maple-ledger/src/lib/
git commit -m "feat(maple-ledger): add typed fetch wrapper api()"
```

---

## Task 7: React app entry + routing + Layout

**Files:**
- Create: `maple-ledger/index.html`
- Create: `maple-ledger/src/main.tsx`
- Create: `maple-ledger/src/index.css`
- Create: `maple-ledger/src/components/Layout.tsx`

- [ ] **Step 1: Create index.html**

Create `maple-ledger/index.html`:
```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Maple Ledger</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create CSS entry**

Create `maple-ledger/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Create main.tsx**

Create `maple-ledger/src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import Layout from './components/Layout.js'
import Transactions from './pages/Transactions.js'
import MonthlyReport from './pages/MonthlyReport.js'
import ExchangeLoss from './pages/ExchangeLoss.js'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/transactions" replace />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/reports/monthly" element={<MonthlyReport />} />
          <Route path="/reports/exchange-loss" element={<ExchangeLoss />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
```

- [ ] **Step 4: Create Layout.tsx**

Create `maple-ledger/src/components/Layout.tsx`:
```tsx
import { Outlet, NavLink } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-6">
        <span className="font-bold text-lg text-gray-900">🍁 Maple Ledger</span>
        <NavLink
          to="/transactions"
          className={({ isActive }) =>
            `text-sm ${isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`
          }
        >
          交易记录
        </NavLink>
        <NavLink
          to="/reports/monthly"
          className={({ isActive }) =>
            `text-sm ${isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`
          }
        >
          月度报表
        </NavLink>
        <NavLink
          to="/reports/exchange-loss"
          className={({ isActive }) =>
            `text-sm ${isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`
          }
        >
          汇率损耗
        </NavLink>
      </nav>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add maple-ledger/index.html maple-ledger/src/main.tsx maple-ledger/src/index.css maple-ledger/src/components/Layout.tsx
git commit -m "feat(maple-ledger): add React entry, routing, and Layout component"
```

---

## Task 8: SummaryCards + TransactionForm components

**Files:**
- Create: `maple-ledger/src/components/SummaryCards.tsx`
- Create: `maple-ledger/src/components/TransactionForm.tsx`
- Create: `maple-ledger/src/components/TransactionForm.test.tsx`

- [ ] **Step 1: Write failing component test**

Create `maple-ledger/src/components/TransactionForm.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TransactionForm from './TransactionForm.js'

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch')
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('TransactionForm', () => {
  it('renders income and expense type toggles', () => {
    render(<TransactionForm onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByText('收入')).toBeInTheDocument()
    expect(screen.getByText('支出')).toBeInTheDocument()
  })

  it('shows RMB amount field when type is income', () => {
    render(<TransactionForm onClose={() => {}} onSaved={() => {}} />)
    fireEvent.click(screen.getByText('收入'))
    expect(screen.getByLabelText(/RMB 金额/)).toBeInTheDocument()
  })

  it('shows CAD amount field when type is expense', () => {
    render(<TransactionForm onClose={() => {}} onSaved={() => {}} />)
    fireEvent.click(screen.getByText('支出'))
    expect(screen.getByLabelText(/CAD 金额/)).toBeInTheDocument()
  })

  it('calls onClose when cancel button clicked', () => {
    const onClose = vi.fn()
    render(<TransactionForm onClose={onClose} onSaved={() => {}} />)
    fireEvent.click(screen.getByText('取消'))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to see it fail**

```bash
cd maple-ledger && npm test src/components/TransactionForm.test.tsx
```
Expected: FAIL — module not found

- [ ] **Step 3: Create SummaryCards**

Create `maple-ledger/src/components/SummaryCards.tsx`:
```tsx
interface Props {
  incomeCad: number
  expenseCad: number
  profitCad: number
  txCount: number
}

export default function SummaryCards({ incomeCad, expenseCad, profitCad, txCount }: Props) {
  const fmt = (n: number) => `CA$${n.toFixed(2)}`
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <Card label="本月收入" value={fmt(incomeCad)} color="green" />
      <Card label="本月支出" value={fmt(expenseCad)} color="red" />
      <Card label="本月利润" value={fmt(profitCad)} color={profitCad >= 0 ? 'blue' : 'red'} />
      <Card label="交易笔数" value={String(txCount)} color="gray" />
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    green: 'text-green-700', red: 'text-red-600', blue: 'text-blue-700', gray: 'text-gray-700',
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-semibold ${colors[color]}`}>{value}</div>
    </div>
  )
}
```

- [ ] **Step 4: Create TransactionForm**

Create `maple-ledger/src/components/TransactionForm.tsx`:
```tsx
import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'

interface Transaction {
  id?: string; type: string; date: string; amount: number; currency: string
  usdRmbRate?: number; cadUsdMarketRate?: number; note?: string; category: string
  tax?: number; bankRate?: number; marketRateAtPurchase?: number
}

interface Props {
  initial?: Partial<Transaction>
  onClose: () => void
  onSaved: () => void
}

const CATEGORIES = [
  { value: 'api_topup', label: 'API 充值' },
  { value: 'user_payment', label: '用户付款' },
  { value: 'server', label: '服务器' },
  { value: 'other', label: '其他' },
]

export default function TransactionForm({ initial, onClose, onSaved }: Props) {
  const [type, setType] = useState(initial?.type ?? 'income')
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState(String(initial?.amount ?? ''))
  const [usdRmbRate, setUsdRmbRate] = useState(String(initial?.usdRmbRate ?? ''))
  const [cadUsdRate, setCadUsdRate] = useState(String(initial?.cadUsdMarketRate ?? ''))
  const [note, setNote] = useState(initial?.note ?? '')
  const [category, setCategory] = useState(initial?.category ?? 'other')
  const [tax, setTax] = useState(String(initial?.tax ?? ''))
  const [bankRate, setBankRate] = useState(String(initial?.bankRate ?? ''))
  const [marketRate, setMarketRate] = useState(String(initial?.marketRateAtPurchase ?? ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (type === 'income' && !cadUsdRate) {
      api<{ rate: number }>('/api/exchange-rate')
        .then(d => setCadUsdRate(String(d.rate)))
        .catch(() => {})
    }
  }, [type])

  const amountCadPreview = () => {
    if (type === 'expense') return Number(amount) || 0
    const r = Number(usdRmbRate)
    const c = Number(cadUsdRate)
    if (!r || !c || !amount) return null
    return Number(amount) / r * c
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const body: Record<string, unknown> = {
      type, date, amount: Number(amount), currency: type === 'income' ? 'RMB' : 'CAD',
      category, note: note || undefined,
    }
    if (type === 'income') {
      body.usdRmbRate = Number(usdRmbRate)
      body.cadUsdMarketRate = Number(cadUsdRate)
    } else {
      if (tax) body.tax = Number(tax)
      if (bankRate) body.bankRate = Number(bankRate)
      if (marketRate) body.marketRateAtPurchase = Number(marketRate)
    }
    try {
      if (initial?.id) {
        await api(`/api/transactions/${initial.id}`, { method: 'PUT', body })
      } else {
        await api('/api/transactions', { method: 'POST', body })
      }
      onSaved()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const preview = amountCadPreview()

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <h2 className="text-lg font-semibold mb-4">{initial?.id ? '编辑交易' : '新增交易'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => setType('income')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border ${type === 'income' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-600'}`}>
              收入
            </button>
            <button type="button" onClick={() => setType('expense')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border ${type === 'expense' ? 'bg-red-50 border-red-500 text-red-600' : 'border-gray-200 text-gray-600'}`}>
              支出
            </button>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">日期</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          {type === 'income' ? (
            <>
              <div>
                <label className="block text-sm text-gray-700 mb-1" htmlFor="amount-rmb">RMB 金额</label>
                <input id="amount-rmb" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">USD/RMB 汇率</label>
                  <input type="number" step="0.0001" value={usdRmbRate} onChange={e => setUsdRmbRate(e.target.value)} required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">CAD/USD 市场汇率</label>
                  <input type="number" step="0.0001" value={cadUsdRate} onChange={e => setCadUsdRate(e.target.value)} required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm text-gray-700 mb-1" htmlFor="amount-cad">CAD 金额</label>
                <input id="amount-cad" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">税（选填）</label>
                  <input type="number" step="0.01" value={tax} onChange={e => setTax(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">银行汇率</label>
                  <input type="number" step="0.0001" value={bankRate} onChange={e => setBankRate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">市场汇率</label>
                  <input type="number" step="0.0001" value={marketRate} onChange={e => setMarketRate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">分类</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">备注（选填）</label>
              <input type="text" value={note} onChange={e => setNote(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {preview !== null && (
            <div className="text-sm text-gray-500">
              换算后：<span className="font-medium text-blue-600">CA${preview.toFixed(4)}</span>
            </div>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              取消
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests to see them pass**

```bash
cd maple-ledger && npm test src/components/TransactionForm.test.tsx
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add maple-ledger/src/components/
git commit -m "feat(maple-ledger): add SummaryCards and TransactionForm components"
```

---

## Task 9: Transactions page

**Files:**
- Create: `maple-ledger/src/pages/Transactions.tsx`

- [ ] **Step 1: Create Transactions page**

Create `maple-ledger/src/pages/Transactions.tsx`:
```tsx
import { useState, useEffect, useCallback } from 'react'
import SummaryCards from '../components/SummaryCards.js'
import TransactionForm from '../components/TransactionForm.js'
import { api } from '../lib/api.js'

interface Transaction {
  id: string; type: string; date: string; amount: number; currency: string
  usdRmbRate?: number; cadUsdMarketRate?: number; amount_cad: number
  note?: string; category: string; created_by: string
}

interface MonthlyReport {
  income_rmb: number; income_cad: number; expense_cad: number; profit_cad: number; tx_count: number
}

const CATEGORY_LABELS: Record<string, string> = {
  api_topup: 'API充值', user_payment: '用户付款', server: '服务器', other: '其他',
}

export default function Transactions() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Transaction | undefined>()
  const [filterType, setFilterType] = useState('')

  const load = useCallback(async () => {
    const params = new URLSearchParams({ month })
    if (filterType) params.set('type', filterType)
    const [txs, rep] = await Promise.all([
      api<Transaction[]>(`/api/transactions?${params}`),
      api<MonthlyReport>(`/api/reports/monthly?month=${month}`),
    ])
    setTransactions(txs)
    setReport(rep)
  }, [month, filterType])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除此交易？')) return
    await api(`/api/transactions/${id}`, { method: 'DELETE' })
    load()
  }

  const prevMonth = () => {
    const d = new Date(`${month}-01`)
    d.setMonth(d.getMonth() - 1)
    setMonth(d.toISOString().slice(0, 7))
  }
  const nextMonth = () => {
    const d = new Date(`${month}-01`)
    d.setMonth(d.getMonth() + 1)
    setMonth(d.toISOString().slice(0, 7))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="text-gray-500 hover:text-gray-900 px-2">‹</button>
          <span className="text-lg font-semibold">{month}</span>
          <button onClick={nextMonth} className="text-gray-500 hover:text-gray-900 px-2">›</button>
        </div>
        <div className="flex items-center gap-3">
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
            <option value="">全部类型</option>
            <option value="income">收入</option>
            <option value="expense">支出</option>
          </select>
          <button onClick={() => { setEditing(undefined); setShowForm(true) }}
            className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700">
            + 新增交易
          </button>
        </div>
      </div>

      {report && (
        <SummaryCards
          incomeCad={report.income_cad}
          expenseCad={report.expense_cad}
          profitCad={report.profit_cad}
          txCount={report.tx_count}
        />
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">日期</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">类型</th>
              <th className="text-right px-4 py-3 text-gray-600 font-medium">金额</th>
              <th className="text-right px-4 py-3 text-gray-600 font-medium">CAD</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">分类</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">备注</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(tx => (
              <tr key={tx.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700">{tx.date}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    tx.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {tx.type === 'income' ? '收入' : '支出'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {tx.currency === 'RMB' ? '¥' : 'CA$'}{tx.amount.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  CA${tx.amount_cad.toFixed(4)}
                </td>
                <td className="px-4 py-3 text-gray-500">{CATEGORY_LABELS[tx.category] ?? tx.category}</td>
                <td className="px-4 py-3 text-gray-500">{tx.note ?? '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setEditing(tx); setShowForm(true) }}
                      className="text-blue-500 hover:text-blue-700 text-xs">编辑</button>
                    <button onClick={() => handleDelete(tx.id)}
                      className="text-red-400 hover:text-red-600 text-xs">删除</button>
                  </div>
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">本月暂无交易记录</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <TransactionForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add maple-ledger/src/pages/Transactions.tsx
git commit -m "feat(maple-ledger): add Transactions list page with filter and CRUD"
```

---

## Task 10: Monthly report page

**Files:**
- Create: `maple-ledger/src/pages/MonthlyReport.tsx`

- [ ] **Step 1: Create MonthlyReport page**

Create `maple-ledger/src/pages/MonthlyReport.tsx`:
```tsx
import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'

interface Report {
  month: string
  income_rmb: number
  income_cad: number
  expense_cad: number
  profit_cad: number
  tx_count: number
}

export default function MonthlyReport() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [report, setReport] = useState<Report | null>(null)
  const [history, setHistory] = useState<Report[]>([])

  useEffect(() => {
    api<Report>(`/api/reports/monthly?month=${month}`).then(setReport).catch(() => {})
  }, [month])

  useEffect(() => {
    const months: Promise<Report>[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const m = d.toISOString().slice(0, 7)
      months.push(api<Report>(`/api/reports/monthly?month=${m}`))
    }
    Promise.all(months).then(setHistory).catch(() => {})
  }, [])

  const profitRate = report && report.income_cad > 0
    ? (report.profit_cad / report.income_cad * 100).toFixed(1)
    : null

  const prevMonth = () => {
    const d = new Date(`${month}-01`)
    d.setMonth(d.getMonth() - 1)
    setMonth(d.toISOString().slice(0, 7))
  }
  const nextMonth = () => {
    const d = new Date(`${month}-01`)
    d.setMonth(d.getMonth() + 1)
    setMonth(d.toISOString().slice(0, 7))
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={prevMonth} className="text-gray-500 hover:text-gray-900 px-2">‹</button>
        <span className="text-lg font-semibold">{month}</span>
        <button onClick={nextMonth} className="text-gray-500 hover:text-gray-900 px-2">›</button>
      </div>

      {report && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <StatCard label="总收入 (RMB)" value={`¥${report.income_rmb.toFixed(2)}`} />
          <StatCard label="总收入 (CAD)" value={`CA$${report.income_cad.toFixed(2)}`} />
          <StatCard label="总支出 (CAD)" value={`CA$${report.expense_cad.toFixed(2)}`} />
          <StatCard label="利润 (CAD)" value={`CA$${report.profit_cad.toFixed(2)}`}
            highlight={report.profit_cad >= 0 ? 'green' : 'red'} />
          {profitRate && <StatCard label="利润率" value={`${profitRate}%`} />}
          <StatCard label="交易笔数" value={String(report.tx_count)} />
        </div>
      )}

      <h3 className="text-sm font-medium text-gray-600 mb-3">近 6 个月利润趋势</h3>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">月份</th>
              <th className="text-right px-4 py-3 text-gray-600 font-medium">收入 (CAD)</th>
              <th className="text-right px-4 py-3 text-gray-600 font-medium">支出 (CAD)</th>
              <th className="text-right px-4 py-3 text-gray-600 font-medium">利润 (CAD)</th>
            </tr>
          </thead>
          <tbody>
            {history.map(r => (
              <tr key={r.month} className={`border-b border-gray-100 ${r.month === month ? 'bg-blue-50' : ''}`}>
                <td className="px-4 py-3 text-gray-700">{r.month}</td>
                <td className="px-4 py-3 text-right text-green-700">CA${r.income_cad.toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-red-600">CA${r.expense_cad.toFixed(2)}</td>
                <td className={`px-4 py-3 text-right font-medium ${r.profit_cad >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                  CA${r.profit_cad.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: 'green' | 'red' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-semibold ${
        highlight === 'green' ? 'text-green-700' : highlight === 'red' ? 'text-red-600' : 'text-gray-900'
      }`}>{value}</div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add maple-ledger/src/pages/MonthlyReport.tsx
git commit -m "feat(maple-ledger): add MonthlyReport page with 6-month trend table"
```

---

## Task 11: Exchange loss page

**Files:**
- Create: `maple-ledger/src/pages/ExchangeLoss.tsx`

- [ ] **Step 1: Create ExchangeLoss page**

Create `maple-ledger/src/pages/ExchangeLoss.tsx`:
```tsx
import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'

interface LossRecord {
  id: string; date: string; amount: number; bank_rate: number
  market_rate_at_purchase: number; loss_cad: number; loss_pct: number
}

interface LossReport {
  total_loss_cad: number
  avg_loss_pct: number
  records: LossRecord[]
}

export default function ExchangeLoss() {
  const now = new Date()
  const [from, setFrom] = useState(`${now.getFullYear()}-01-01`)
  const [to, setTo] = useState(now.toISOString().slice(0, 10))
  const [data, setData] = useState<LossReport | null>(null)

  useEffect(() => {
    api<LossReport>(`/api/reports/exchange-loss?from=${from}&to=${to}`)
      .then(setData).catch(() => {})
  }, [from, to])

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm text-gray-600">从</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        <label className="text-sm text-gray-600">到</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500 mb-1">总汇率损耗</div>
              <div className="text-xl font-semibold text-red-600">CA${data.total_loss_cad.toFixed(4)}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500 mb-1">平均损耗百分比</div>
              <div className="text-xl font-semibold text-red-600">{data.avg_loss_pct.toFixed(2)}%</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">日期</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">金额 (CAD)</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">银行汇率</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">市场汇率</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">损耗 (CAD)</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">损耗%</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map(r => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{r.date}</td>
                    <td className="px-4 py-3 text-right text-gray-700">CA${r.amount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.bank_rate.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.market_rate_at_purchase.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right text-red-600">CA${r.loss_cad.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{r.loss_pct.toFixed(2)}%</td>
                  </tr>
                ))}
                {data.records.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      所选时间段内无含汇率数据的支出记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add maple-ledger/src/pages/ExchangeLoss.tsx
git commit -m "feat(maple-ledger): add ExchangeLoss analysis page"
```

---

## Task 12: Build verification + deploy prep

- [ ] **Step 1: Run full test suite**

```bash
cd maple-ledger && npm test
```
Expected: all PASS

- [ ] **Step 2: Typecheck**

```bash
cd maple-ledger && npm run typecheck
```
Expected: no errors

- [ ] **Step 3: Build**

```bash
cd maple-ledger && npm run build
```
Expected: `dist/` generated without errors

- [ ] **Step 4: Create D1 database (first deploy only)**

```bash
wrangler d1 create maple-ledger
# Copy the database_id output into wrangler.toml
```

- [ ] **Step 5: Apply migration to production D1**

```bash
cd maple-ledger && npm run db:migrate
```

- [ ] **Step 6: Connect to Cloudflare Pages**

1. Push `maple-ledger/` directory to a GitHub repo
2. In Cloudflare Dashboard → Pages → Create project → Connect to Git
3. Build command: `npm run build`
4. Build output directory: `dist`
5. Set environment variable (if needed): none required for MVP
6. Configure Cloudflare Access to protect the domain

- [ ] **Step 7: Final commit**

```bash
git add maple-ledger/
git commit -m "feat(maple-ledger): complete MVP — transactions CRUD, reports, exchange loss analysis"
```
