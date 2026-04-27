# Claude 中转网关 MVP — Part 2 实施计划（控制台 + 观测 + 公开接口 + 部署）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Part 1（网关核心已通）基础上补齐控制台 CRUD、Playground、限流/幂等/观测、公开接口、部署脚本。做完后前端 `VITE_USE_MOCK=false` 可以完全脱离 mock 跑起来。

**Architecture:** 继续使用现有模块结构。新增 `routes/console/{overview,logs,billing,playground,alerts}.ts`、`routes/public/*`、`middleware/{rate-limit,idempotency}.ts`、`observability/metrics.ts`。核心原则：只读接口直接查 DB，写接口走现成 service 层。

**Tech Stack:** Node.js 20 · Hono · Drizzle · Postgres · Redis · prom-client · nginx（部署）

**Spec:** `docs/superpowers/specs/2026-04-27-claude-relay-mvp-design.md`
**Part 1 plan:** `docs/superpowers/plans/2026-04-27-claude-relay-part1-gateway-core.md`

---

## Milestone 6 — 控制台只读 + 告警 CRUD

### Task 1: `alerts` 表

**Files:** modify `backend/src/db/schema.ts`

- [ ] **Step 1:** Append:
```ts
export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),        // 'balance_low' | 'spend_daily' | 'error_rate'
  threshold: text('threshold').notNull(),
  channel: text('channel').notNull(),  // 'email' | 'browser'
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```
- [ ] **Step 2:** `npm run db:generate && npm run db:migrate`
- [ ] **Step 3:** Commit: `feat(db): alerts table`

### Task 2: `/api/console/overview`

**Files:** `backend/src/routes/console/overview.ts` (create) · `backend/src/app.ts` (mount)

聚合：metrics（uptime_30d/p99_live_ms/requests_30d/spent/projection）、latency_series（最近 N 条的 latency_ms）、recent_requests（最近 5 条，与 logs 同结构）。全部来自 `request_logs`。

- [ ] **Step 1:** Write handler. Full code:
```ts
import { Hono } from 'hono'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { db } from '../../db/client.js'
import { requestLogs } from '../../db/schema.js'

export const overviewRoutes = new Hono()
overviewRoutes.use('*', requireBearer)

overviewRoutes.get('/', async (c) => {
  const userId = c.get('user').id
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000)

  const [stats] = await db
    .select({
      count: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where status >= '400')::int`,
      p99: sql<number>`coalesce(percentile_cont(0.99) within group (order by latency_ms), 0)::int`,
      spent: sql<string>`coalesce(sum(cost_usd), 0)::text`,
    })
    .from(requestLogs)
    .where(and(eq(requestLogs.userId, userId), gte(requestLogs.createdAt, thirtyDaysAgo)))

  const recent = await db.select().from(requestLogs)
    .where(eq(requestLogs.userId, userId))
    .orderBy(desc(requestLogs.createdAt))
    .limit(5)

  const latencyRows = await db.select({ latency: requestLogs.latencyMs }).from(requestLogs)
    .where(eq(requestLogs.userId, userId))
    .orderBy(desc(requestLogs.createdAt))
    .limit(60)

  const total = Number(stats!.count)
  const uptime = total === 0 ? '100.00%' : ((1 - Number(stats!.errors) / total) * 100).toFixed(2) + '%'

  return c.json({
    metrics: {
      uptime_30d: uptime,
      p99_live_ms: stats!.p99,
      requests_30d: String(total),
      spent: `$${Number(stats!.spent).toFixed(2)}`,
      projection: `$${(Number(stats!.spent) * 2).toFixed(2)}`,  // naive 2x extrapolation
    },
    latency_series: latencyRows.reverse().map((r) => Number(r.latency)),
    recent_requests: recent.map((r) => ({
      id: r.id,
      status: Number(r.status),
      model: r.model,
      latency_ms: Number(r.latencyMs),
      tokens: Number(r.inputTokens) + Number(r.outputTokens),
      cost: Number(r.costUsd).toFixed(4),
      region: 'cn-east-1',   // static, per spec §7.3
      created_at: r.createdAt,
      audit_match: r.auditMatch,
    })),
  })
})
```

- [ ] **Step 2:** Mount in `app.ts`: `app.route('/api/console/overview', overviewRoutes)`.
- [ ] **Step 3:** Integration test `overview.test.ts`: register user → insert a few `request_logs` rows directly via db → GET /overview → assert metrics/recent/latency fields. Reuse the `set -a && source .env && set +a && npx vitest run` pattern.
- [ ] **Step 4:** Commit: `feat(console): overview aggregation`

### Task 3: `/api/console/logs` + `/logs/:id`

**Files:** `backend/src/routes/console/logs.ts` · mount in `app.ts`

- [ ] **Step 1:** List with filters (`status`, `model`, `limit`) + detail with audit block:
```ts
import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { db } from '../../db/client.js'
import { requestLogs } from '../../db/schema.js'
import { AppError } from '../../shared/errors.js'

export const logsRoutes = new Hono()
logsRoutes.use('*', requireBearer)

logsRoutes.get('/', async (c) => {
  const status = c.req.query('status')
  const model = c.req.query('model')
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200)
  const userId = c.get('user').id

  const conds = [eq(requestLogs.userId, userId)]
  if (status) conds.push(eq(requestLogs.status, status))
  if (model) conds.push(eq(requestLogs.model, model))

  const rows = await db.select().from(requestLogs)
    .where(and(...conds))
    .orderBy(desc(requestLogs.createdAt))
    .limit(limit)

  return c.json({
    logs: rows.map((r) => ({
      id: r.id,
      status: Number(r.status),
      model: r.model,
      latency_ms: Number(r.latencyMs),
      tokens: Number(r.inputTokens) + Number(r.outputTokens),
      cost: Number(r.costUsd).toFixed(4),
      region: 'cn-east-1',
      created_at: r.createdAt,
      audit_match: r.auditMatch,
    })),
    total: rows.length,
  })
})

logsRoutes.get('/:id', async (c) => {
  const row = await db.query.requestLogs.findFirst({
    where: and(eq(requestLogs.id, c.req.param('id')), eq(requestLogs.userId, c.get('user').id)),
  })
  if (!row) throw new AppError('not_found')
  return c.json({
    log: {
      id: row.id, status: Number(row.status), model: row.model,
      latency_ms: Number(row.latencyMs), tokens: Number(row.inputTokens) + Number(row.outputTokens),
      cost: Number(row.costUsd).toFixed(4), region: 'cn-east-1',
      created_at: row.createdAt, audit_match: row.auditMatch,
    },
    audit: {
      upstream_endpoint: `https://api.anthropic.com${row.endpoint}`,
      request_hash: row.requestHash,
      upstream_request_hash: row.upstreamRequestHash,
      match: row.auditMatch,
    },
  })
})
```
- [ ] **Step 2:** Mount `app.route('/api/console/logs', logsRoutes)`.
- [ ] **Step 3:** Integration test: seed 3 logs → filter by status → assert shape.
- [ ] **Step 4:** Commit: `feat(console): logs list + detail`

### Task 4: `/api/console/billing` + invoices + recharges

**Files:** `backend/src/routes/console/billing.ts` · mount

- [ ] **Step 1:** Read-only aggregations from `users`, `billing_ledger`. Invoices/recharges return empty arrays (MVP scope). Recharge endpoint returns 501.
```ts
import { Hono } from 'hono'
import { and, gte, sql } from 'drizzle-orm'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { db } from '../../db/client.js'
import { billingLedger, users } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import { AppError } from '../../shared/errors.js'

export const billingRoutes = new Hono()
billingRoutes.use('*', requireBearer)

billingRoutes.get('/', async (c) => {
  const u = c.get('user')
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const [used] = await db.select({ sum: sql<string>`coalesce(sum(-amount_usd), 0)::text` })
    .from(billingLedger)
    .where(and(eq(billingLedger.userId, u.id), sql`kind = 'debit_usage'`, gte(billingLedger.createdAt, monthStart)))

  const usedUsd = Number(used!.sum)
  const balance = Number(u.balanceUsd)
  const limit = u.limitMonthlyUsd ? Number(u.limitMonthlyUsd) : null

  const now = new Date()
  const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  return c.json({
    billing: {
      month_label: `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`,
      used: `$${usedUsd.toFixed(2)}`,
      limit: limit !== null ? `$${limit.toFixed(2)}` : '∞',
      projection: `$${(usedUsd * 2).toFixed(2)}`,
      next_reset: nextReset.toISOString().slice(0, 10),
      balance: `$${balance.toFixed(2)}`,
      used_usd: usedUsd.toFixed(6),
      balance_usd: balance.toFixed(6),
    },
    plan: u.plan,
  })
})

billingRoutes.get('/../invoices', (c) => c.json({ invoices: [] }))     // TODO: mount separately
billingRoutes.get('/../recharges', (c) => c.json({ recharges: [] }))
billingRoutes.post('/../recharge', () => { throw new AppError('not_implemented', '充值功能即将上线') })
```
Actually mount the 3 neighbor routes at `/api/console/invoices`, `/api/console/recharges`, `/api/console/recharge` as separate Hono apps to avoid path hacks.

- [ ] **Step 2:** Mount all four paths.
- [ ] **Step 3:** Commit: `feat(console): billing read-only + recharge stub`

### Task 5: `/api/console/alerts` CRUD

**Files:** `backend/src/services/alerts.ts` · `backend/src/routes/console/alerts.ts` · mount

- [ ] **Step 1:** Service layer with `list/create/patch/remove`, scoped by `userId`.
- [ ] **Step 2:** Routes (GET list / POST create / PATCH /:id / DELETE /:id). Use zod validators with kind enum `['balance_low', 'spend_daily', 'error_rate']`, channel enum `['email', 'browser']`.
- [ ] **Step 3:** Integration test: create → list → patch → delete.
- [ ] **Step 4:** Commit: `feat(console): alerts crud (persist-only, no trigger)`

---

## Milestone 7 — Playground

### Task 6: `/api/console/playground`

Internal call path: front-end posts Bearer session + Anthropic-shape body → route needs to invoke gateway with the user's "system" api_key on their behalf. MVP: 直接调用 `/v1/messages` 管道**不经过公网**。

**Files:** `backend/src/routes/console/playground.ts` · mount

- [ ] **Step 1:** Since Playground is session-authenticated (not api-key-authenticated) but must still run through the full gateway pipeline for logging + billing, create an internal entry-point that accepts `(user, body)` and returns the upstream response. Refactor a helper out of `routes/v1/messages.ts` into `gateway/handle-messages.ts` that both the `/v1/*` route and playground can call.
- [ ] **Step 2:** Playground constraints (MVP): non-stream only, uses the user's oldest active api_key for attribution (creates one lazily if the user has none named `playground`).
- [ ] **Step 3:** Route handler calls the shared handler, returns body + `audit_id` + `latency_ms` as spec §3.7 describes.
- [ ] **Step 4:** Integration test with mock upstream server (see M10 Task 12 for mock setup — defer this test until then; for now just typecheck).
- [ ] **Step 5:** Commit: `feat(console): playground via internal gateway handler`

---

## Milestone 8 — Redis 限流 / 幂等 / 观测

### Task 7: Rate limit middleware

**Files:** `backend/src/middleware/rate-limit.ts` · `backend/src/middleware/rate-limit.test.ts`

Redis 令牌桶：key `rl:api_key:<id>:rpm` 每分钟重置；`rl:user:<id>:rpm` 兜底。

- [ ] **Step 1:** Write test with a mocked redis client (use `ioredis-mock` or inject a fake). Assert: first N requests pass, N+1 returns 429.
- [ ] **Step 2:** Implement using a sliding-counter via `INCR` + `EXPIRE`:
```ts
import type { MiddlewareHandler } from 'hono'
import { redis } from '../redis/client.js'
import { AppError } from '../shared/errors.js'

export const DEFAULT_RPM = 60

export function rateLimit(getBucket: (c: any) => { key: string; limit: number }): MiddlewareHandler {
  return async (c, next) => {
    const { key, limit } = getBucket(c)
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, 60)
    if (count > limit) throw new AppError('rate_limit', `${limit} rpm`)
    await next()
  }
}
```
- [ ] **Step 3:** Apply to `/v1/messages` route via:
```ts
v1Messages.use('*', rateLimit((c) => {
  const apiKey = c.get('apiKey')
  const bucket = Math.floor(Date.now() / 60_000)
  return {
    key: `rl:api_key:${apiKey.id}:${bucket}`,
    limit: apiKey.rpmLimit ? Number(apiKey.rpmLimit) : DEFAULT_RPM,
  }
}))
```
- [ ] **Step 4:** Commit.

### Task 8: Idempotency middleware

**Files:** `backend/src/middleware/idempotency.ts` + test

Key: `idem:<user_id>:<header>`. Stores `{ status, body, headers }` in Redis with TTL 24h. On replay, returns cached response without calling upstream.

- [ ] **Step 1:** Test: first POST caches, second POST with same header returns same body + header `x-idempotent-replay: true`.
- [ ] **Step 2:** Implement. Skip the middleware if no `Idempotency-Key` header. Handle concurrent-duplicate race via `SET NX` sentinel.
- [ ] **Step 3:** Apply only to `/v1/messages` non-stream branch (streaming idempotency is complex and out of MVP scope — document).
- [ ] **Step 4:** Commit.

### Task 9: Prometheus `/metrics`

**Files:** `backend/src/observability/metrics.ts` · `backend/src/routes/metrics.ts`

Install `prom-client`. Expose counters/histograms per spec §9.

- [ ] **Step 1:** Register metrics: `gateway_requests_total{model,status}`, `gateway_latency_ms_bucket{model,phase}`, `upstream_state{upstream_key_id,state}`, `billing_usd_consumed_total{model}`.
- [ ] **Step 2:** Increment them inside `commitRequest` and upstream state changes.
- [ ] **Step 3:** `/metrics` route gated by `env.METRICS_TOKEN` (if set, require `Authorization: Bearer <token>`).
- [ ] **Step 4:** Commit.

---

## Milestone 9 — 公开接口静态化

### Task 10: `/api/public/*`

**Files:** `backend/src/routes/public/*.ts` · `backend/config/*.json` (stats, regions, plans, status, changelog)

六个端点（stats / regions / models / plans / status / changelog）。Models 从 DB 取（enabled=true），其余从 JSON 配置文件读取。

- [ ] **Step 1:** Create `backend/config/public.json`:
```json
{
  "stats": { "uptime_30d": "99.97%", "p50_latency": "187ms", "p99_latency": "412ms", "consistency": "100%", "region": "cn-east-1" },
  "regions": [{ "id": "cn-east-1", "name": "上海", "status": "ok", "latency": "187ms" }],
  "plans": [
    { "name": "Starter", "price": "¥0", "per": "起步赠送 $10", "cta": "免费开始", "features": ["..."] },
    { "name": "Pro", "price": "¥199", "per": "/ 月起", "cta": "升级到 Pro", "featured": true, "features": ["..."] }
  ],
  "status": { "overall": "ok", "components": [{ "id": "gateway", "name": "网关", "status": "ok", "note": "" }], "incidents": [] },
  "changelog": [{ "date": "2026-04-27", "tag": "feature", "title": "中转网关上线", "body": "..." }]
}
```
- [ ] **Step 2:** Create one route file per endpoint. Models route joins config with DB.
- [ ] **Step 3:** Mount under `/api/public`.
- [ ] **Step 4:** Commit.

---

## Milestone 10 — 部署 + 真端到端测试

### Task 11: nginx 反代 + docker-compose 全栈

**Files:** `backend/docker-compose.yml` (扩充) · `backend/nginx.conf` · `backend/Dockerfile`（补前端 build）

- [ ] **Step 1:** Add `app` service to docker-compose (builds via `Dockerfile`).
- [ ] **Step 2:** Add `frontend` service that builds `frontend/dist`, serves via an `nginx` service with `/api` + `/v1` proxied to `app:8080`.
- [ ] **Step 3:** Verify full stack: `docker compose up -d`, then `curl http://localhost/healthz` via nginx proxy.
- [ ] **Step 4:** Commit.

### Task 12: Mock Anthropic server for e2e tests

**Files:** `backend/tests/e2e/mock-upstream.ts` · `backend/tests/e2e/full-flow.test.ts`

Use `msw` or raw `http.createServer` to mock `/v1/messages` returning deterministic usage. Point `ANTHROPIC_UPSTREAM_BASE_URL` at the mock in the test file.

- [ ] **Step 1:** Write e2e test: register → sk-relay → upstream key add → model sync (mock returns fixed list) → POST /v1/messages → assert log, ledger, audit_match.
- [ ] **Step 2:** Write e2e for streaming: mock emits SSE events → gateway relays them → verify TTFB + final usage commit.
- [ ] **Step 3:** Write e2e for all-upstreams-down: seed zero upstream keys → expect 502 with audit row.
- [ ] **Step 4:** Commit.

### Task 13: Frontend 接入 + 文档

**Files:** `frontend/.env.example` · `frontend/README.md` (extend) · 删除 `frontend/src/lib/mock.js` 的引用

- [ ] **Step 1:** Add `VITE_USE_MOCK=false` + `VITE_API_TARGET=http://localhost:8090` to `frontend/.env.example`.
- [ ] **Step 2:** Verify `api.js` gracefully works without mock injection (read `src/main.jsx` — if mock install is conditional, great; otherwise gate it on `import.meta.env.VITE_USE_MOCK === 'true'`).
- [ ] **Step 3:** Smoke: `cd frontend && VITE_USE_MOCK=false npm run dev`, then in browser register/login/create key/see overview populated from backend.
- [ ] **Step 4:** Document currency-field mapping in `frontend/README.md` (backend returns `balance_usd` + `balance` display string; front-end uses display string).
- [ ] **Step 5:** Commit.

### Task 14: Part 2 README wrap-up

**Files:** `backend/README.md` (扩充到 Part 2 范围)

- [ ] **Step 1:** Update feature checklist to mark Part 2 items done.
- [ ] **Step 2:** Add "production deployment" section referencing docker-compose + nginx.
- [ ] **Step 3:** Commit.

---

## Self-Review 清单

- **Spec 覆盖**：API.md §3.1/3.2/3.4/3.5/3.6 → Tasks 2-5；§3.7 → Task 6；§1.x → Task 10；§7 递延的占位 → Task 4 (recharge 501)。
- **Placeholder scan**：Task 4 `/../invoices` path hack 在 Step 1 已标注要改成独立 route；不能留到实现时。Task 6 test 延后到 Task 12 有说明。Task 12 选 msw 或原生 http，实现时挑一个。
- **Type consistency**：`handleMessages(user, body)` 签名在 Task 6 和 Task 12 必须一致。`rateLimit(getBucket)` 签名在 Task 7 和其使用点一致。

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-04-27-claude-relay-part2-console-and-deploy.md`. Recommend same approach as Part 1: subagent-driven execution, milestone-by-milestone, reviewer gate after each milestone.
