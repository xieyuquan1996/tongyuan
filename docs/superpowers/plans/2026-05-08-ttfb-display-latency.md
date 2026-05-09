# display_latency_ms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在请求日志 API 中新增 `display_latency_ms` 字段（流式取 TTFB，非流式取总延迟），console 路由仅返回该字段，admin 路由同时保留原始字段。

**Architecture:** 计算逻辑 `stream && ttfb_ms != null ? ttfb_ms : latency_ms` 内联在各路由响应序列化处；不提取公共函数（三处一行代码，YAGNI）。后端先写 FT，前端后改。

**Tech Stack:** Hono, Drizzle ORM, Postgres, Vitest, React

---

## 文件变更清单

| 操作 | 文件 | 内容 |
|------|------|------|
| Create | `backend/src/tests/logs-display-latency.test.ts` | FT：验证三条路由的响应字段 |
| Modify | `backend/src/routes/console/logs.ts` | 移除 `latency_ms`，新增 `display_latency_ms` |
| Modify | `backend/src/routes/admin/logs.ts` | 列表查询补选 `ttfbMs`，新增 `ttfb_ms`/`display_latency_ms` |
| Modify | `backend/src/routes/admin/users.ts` | `recent_logs` 新增 `ttfb_ms`/`display_latency_ms` |
| Modify | `frontend/src/pages/dashboard/Logs.jsx` | `latency_ms` → `display_latency_ms`（2 处）|
| Modify | `frontend/src/pages/admin/Logs.jsx` | `latency_ms` → `display_latency_ms`（2 处）|
| Modify | `frontend/src/components/dashboard-widgets.jsx` | `latency_ms` → `display_latency_ms`（1 处）|

---

### Task 1: 为三条路由写 FT（先写失败测试）

**Files:**
- Create: `backend/src/tests/logs-display-latency.test.ts`

**运行测试前准备：**

```bash
cd backend
set -a && source .env && set +a
docker compose up -d
```

- [ ] **Step 1: 创建测试文件**

```typescript
// backend/src/tests/logs-display-latency.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../app.js'
import { db, pool } from '../db/client.js'
import { users, requestLogs, apiKeys } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { issueSession } from '../services/sessions.js'
import { hashPassword } from '../crypto/password.js'
import { newApiKey } from '../crypto/tokens.js'
import bcrypt from 'bcryptjs'

const app = createApp()
const EMAIL = 'logs-display-latency-test@example.com'
const ADMIN_EMAIL = 'logs-display-latency-admin@example.com'
let userId = ''
let adminId = ''
let token = ''
let adminToken = ''

beforeAll(async () => {
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [[EMAIL, ADMIN_EMAIL]])

  const [u] = await db.insert(users).values({
    email: EMAIL,
    passwordHash: await hashPassword('secret'),
    name: 'test',
    balanceUsd: '10',
  }).returning()
  userId = u!.id
  const { token: t } = await issueSession(userId)
  token = t

  const [a] = await db.insert(users).values({
    email: ADMIN_EMAIL,
    passwordHash: await hashPassword('secret'),
    name: 'admin',
    role: 'admin',
    balanceUsd: '0',
  }).returning()
  adminId = a!.id
  const { token: at } = await issueSession(adminId)
  adminToken = at
})

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [[EMAIL, ADMIN_EMAIL]])
})

async function insertLog(opts: {
  userId: string
  stream: boolean
  latencyMs: string
  ttfbMs: string | null
}) {
  const [row] = await db.insert(requestLogs).values({
    userId: opts.userId,
    model: 'claude-3-5-haiku-20241022',
    upstreamModel: 'claude-3-5-haiku-20241022',
    endpoint: '/v1/messages',
    status: '200',
    stream: opts.stream,
    inputTokens: '10',
    outputTokens: '5',
    cacheReadTokens: '0',
    cacheWriteTokens: '0',
    cacheWrite1hTokens: '0',
    costUsd: '0.0001',
    latencyMs: opts.latencyMs,
    ttfbMs: opts.ttfbMs,
    requestHash: 'hash-' + Math.random().toString(36).slice(2),
    upstreamRequestHash: 'uhash-' + Math.random().toString(36).slice(2),
    idempotencyKey: null,
    auditMatch: true,
  }).returning()
  return row!
}

describe('GET /api/console/logs — display_latency_ms', () => {
  it('streaming: display_latency_ms equals ttfb_ms', async () => {
    await insertLog({ userId, stream: true, latencyMs: '5000', ttfbMs: '300' })

    const res = await app.fetch(
      new Request('http://localhost/api/console/logs'),
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(200)
    const body = await res.json() as any
    const log = body.logs[0]
    expect(log.display_latency_ms).toBe(300)
    expect(log).not.toHaveProperty('latency_ms')
    expect(log).not.toHaveProperty('ttfb_ms')
  })

  it('non-streaming: display_latency_ms equals latency_ms', async () => {
    await pool.query('DELETE FROM request_logs WHERE user_id=$1', [userId])
    await insertLog({ userId, stream: false, latencyMs: '800', ttfbMs: null })

    const res = await app.fetch(
      new Request('http://localhost/api/console/logs'),
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(200)
    const body = await res.json() as any
    const log = body.logs[0]
    expect(log.display_latency_ms).toBe(800)
    expect(log).not.toHaveProperty('latency_ms')
  })
})

describe('GET /api/console/logs/:id — display_latency_ms', () => {
  it('streaming detail: display_latency_ms equals ttfb_ms', async () => {
    await pool.query('DELETE FROM request_logs WHERE user_id=$1', [userId])
    const inserted = await insertLog({ userId, stream: true, latencyMs: '9000', ttfbMs: '400' })

    const res = await app.fetch(
      new Request(`http://localhost/api/console/logs/${inserted.id}`),
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.log.display_latency_ms).toBe(400)
    expect(body.log).not.toHaveProperty('latency_ms')
  })
})

describe('GET /api/admin/logs — ttfb_ms + display_latency_ms', () => {
  it('streaming: exposes ttfb_ms and display_latency_ms', async () => {
    await pool.query('DELETE FROM request_logs WHERE user_id=$1', [userId])
    await insertLog({ userId, stream: true, latencyMs: '5000', ttfbMs: '250' })

    const res = await app.fetch(
      new Request('http://localhost/api/admin/logs'),
      { headers: { Authorization: `Bearer ${adminToken}` } },
    )
    expect(res.status).toBe(200)
    const body = await res.json() as any
    const log = body.logs.find((l: any) => l.user_email === EMAIL)
    expect(log.ttfb_ms).toBe(250)
    expect(log.display_latency_ms).toBe(250)
    expect(log.latency_ms).toBe(5000)
  })

  it('non-streaming: ttfb_ms is null, display_latency_ms equals latency_ms', async () => {
    await pool.query('DELETE FROM request_logs WHERE user_id=$1', [userId])
    await insertLog({ userId, stream: false, latencyMs: '700', ttfbMs: null })

    const res = await app.fetch(
      new Request('http://localhost/api/admin/logs'),
      { headers: { Authorization: `Bearer ${adminToken}` } },
    )
    expect(res.status).toBe(200)
    const body = await res.json() as any
    const log = body.logs.find((l: any) => l.user_email === EMAIL)
    expect(log.ttfb_ms).toBeNull()
    expect(log.display_latency_ms).toBe(700)
    expect(log.latency_ms).toBe(700)
  })
})

describe('GET /api/admin/users/:id — recent_logs ttfb_ms + display_latency_ms', () => {
  it('streaming: recent_logs has ttfb_ms and display_latency_ms', async () => {
    await pool.query('DELETE FROM request_logs WHERE user_id=$1', [userId])
    await insertLog({ userId, stream: true, latencyMs: '6000', ttfbMs: '500' })

    const res = await app.fetch(
      new Request(`http://localhost/api/admin/users/${userId}`),
      { headers: { Authorization: `Bearer ${adminToken}` } },
    )
    expect(res.status).toBe(200)
    const body = await res.json() as any
    const log = body.recent_logs[0]
    expect(log.ttfb_ms).toBe(500)
    expect(log.display_latency_ms).toBe(500)
    expect(log.latency_ms).toBe(6000)
  })
})
```

- [ ] **Step 2: 运行测试，确认全部失败**

```bash
cd backend
npx vitest run src/tests/logs-display-latency.test.ts
```

期望：所有测试 FAIL（字段不存在 / `latency_ms` 仍在）

---

### Task 2: 更新 `routes/console/logs.ts`

**Files:**
- Modify: `backend/src/routes/console/logs.ts:38-56` (列表)
- Modify: `backend/src/routes/console/logs.ts:64-69` (详情)

- [ ] **Step 1: 修改列表响应（移除 `latency_ms`，新增 `display_latency_ms`）**

在 `logsRoutes.get('/', ...)` 的 `rows.map` 中：

```typescript
    logs: rows.map((r) => ({
      id: r.id,
      status: Number(r.status),
      model: r.model,
      display_latency_ms: r.stream && r.ttfbMs != null ? Number(r.ttfbMs) : Number(r.latencyMs),
      ...serializeTokenFields(r),
      cost: Number(r.costUsd).toFixed(4),
      region: 'cn-east-1',
      type: r.endpoint?.includes('/batches') ? 'Batch' : r.stream ? 'SSE' : 'HTTP',
      stream: r.stream,
      service_tier: 'Standard',
      endpoint: r.endpoint,
      created_at: r.createdAt,
      audit_match: r.auditMatch,
    })),
```

- [ ] **Step 2: 修改详情响应**

在 `logsRoutes.get('/:id', ...)` 的返回中：

```typescript
  return c.json({
    log: {
      id: row.id, status: Number(row.status), model: row.model,
      display_latency_ms: row.stream && row.ttfbMs != null ? Number(row.ttfbMs) : Number(row.latencyMs),
      tokens: serializeTokenFields(row).tokens,
      cost: Number(row.costUsd).toFixed(4), region: 'cn-east-1',
      created_at: row.createdAt, audit_match: row.auditMatch,
    },
    audit: {
      upstream_endpoint: `https://api.anthropic.com${row.endpoint}`,
      request_hash: row.requestHash,
      upstream_request_hash: row.upstreamRequestHash,
      match: row.auditMatch,
      model_hash: `sha256:${row.requestHash.slice(0, 16)}...${row.requestHash.slice(-8)}`,
      max_tokens: 0,
      system_len: 0,
      messages_len: 0,
    },
  })
```

- [ ] **Step 3: 运行相关测试，确认 console/logs 用例通过**

```bash
cd backend
npx vitest run src/tests/logs-display-latency.test.ts
```

期望：console/logs 的四个 case 全部 PASS，admin 用例仍 FAIL

- [ ] **Step 4: 类型检查**

```bash
cd backend && npx tsc --noEmit
```

期望：无错误

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/console/logs.ts backend/src/tests/logs-display-latency.test.ts
git commit -m "feat(logs): replace latency_ms with display_latency_ms in console/logs route"
```

---

### Task 3: 更新 `routes/admin/logs.ts`

**Files:**
- Modify: `backend/src/routes/admin/logs.ts:29-51` (列表查询)
- Modify: `backend/src/routes/admin/logs.ts:59-79` (列表响应)
- Modify: `backend/src/routes/admin/logs.ts:89-110` (详情响应)

- [ ] **Step 1: 在列表查询的 `db.select({...})` 中补选 `ttfbMs`**

在现有 select 对象中（大约第 29-51 行），在 `latencyMs` 下面加一行：

```typescript
      latencyMs: requestLogs.latencyMs,
      ttfbMs: requestLogs.ttfbMs,
```

- [ ] **Step 2: 在列表响应的 `rows.map` 中新增两个字段**

```typescript
      latency_ms: Number(r.latencyMs),
      ttfb_ms: r.ttfbMs !== null ? Number(r.ttfbMs) : null,
      display_latency_ms: r.stream && r.ttfbMs != null ? Number(r.ttfbMs) : Number(r.latencyMs),
```

- [ ] **Step 3: 在详情响应（`adminLogsRoutes.get('/:id', ...)`）中新增两个字段**

```typescript
    log: {
      id: row.id, status: Number(row.status), model: row.model,
      latency_ms: Number(row.latencyMs),
      ttfb_ms: row.ttfbMs !== null ? Number(row.ttfbMs) : null,
      display_latency_ms: row.stream && row.ttfbMs != null ? Number(row.ttfbMs) : Number(row.latencyMs),
      tokens: serializeTokenFields(row).tokens,
      cost: Number(row.costUsd).toFixed(4),
      region: 'cn-east-1',
      created_at: row.createdAt,
      audit_match: row.auditMatch,
      user_email: u?.email ?? null,
      owner_email: u?.email ?? null,
    },
```

- [ ] **Step 4: 运行测试**

```bash
cd backend
npx vitest run src/tests/logs-display-latency.test.ts
```

期望：admin/logs 用例 PASS，admin/users 用例仍 FAIL

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin/logs.ts
git commit -m "feat(logs): add ttfb_ms + display_latency_ms to admin/logs route"
```

---

### Task 4: 更新 `routes/admin/users.ts`

**Files:**
- Modify: `backend/src/routes/admin/users.ts:105-108` (recent_logs)

- [ ] **Step 1: 在 `recent_logs` 映射中新增两个字段**

```typescript
    recent_logs: logs.map((l) => ({
      id: l.id, status: Number(l.status), model: l.model,
      latency_ms: Number(l.latencyMs),
      ttfb_ms: l.ttfbMs !== null ? Number(l.ttfbMs) : null,
      display_latency_ms: l.stream && l.ttfbMs != null ? Number(l.ttfbMs) : Number(l.latencyMs),
      created_at: l.createdAt,
    })),
```

（`logs` 来自 `db.select()` 全字段查询，`ttfbMs` 和 `stream` 已在结果中）

- [ ] **Step 2: 运行全部测试**

```bash
cd backend
npx vitest run src/tests/logs-display-latency.test.ts
```

期望：所有用例全部 PASS

- [ ] **Step 3: 运行完整测试套件**

```bash
cd backend
npm test
```

期望：全部 PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/admin/users.ts
git commit -m "feat(logs): add ttfb_ms + display_latency_ms to admin/users recent_logs"
```

---

### Task 5: 更新前端（5 处 `latency_ms` → `display_latency_ms`）

**Files:**
- Modify: `frontend/src/pages/dashboard/Logs.jsx:307`
- Modify: `frontend/src/pages/dashboard/Logs.jsx:345`
- Modify: `frontend/src/pages/admin/Logs.jsx:92`
- Modify: `frontend/src/pages/admin/Logs.jsx:204`
- Modify: `frontend/src/components/dashboard-widgets.jsx:136`

- [ ] **Step 1: 修改 `frontend/src/pages/dashboard/Logs.jsx`**

第 307 行，将：
```jsx
{fmtRelative(log.created_at)} · {log.model} · {log.tokens} tokens · {log.latency_ms || "—"}ms
```
改为：
```jsx
{fmtRelative(log.created_at)} · {log.model} · {log.tokens} tokens · {log.display_latency_ms || "—"}ms
```

第 345 行，将：
```jsx
<Kv k="latency" v={(log.latency_ms || "—") + "ms"} />
```
改为：
```jsx
<Kv k="latency" v={(log.display_latency_ms || "—") + "ms"} />
```

- [ ] **Step 2: 修改 `frontend/src/pages/admin/Logs.jsx`**

第 92 行，将：
```jsx
<td style={{ ...td, fontFamily: "var(--font-mono)" }}>{l.latency_ms ? l.latency_ms + "ms" : "—"}</td>
```
改为：
```jsx
<td style={{ ...td, fontFamily: "var(--font-mono)" }}>{l.display_latency_ms ? l.display_latency_ms + "ms" : "—"}</td>
```

第 204 行，将：
```jsx
{log.owner_email} · {log.model} · {log.latency_ms || "—"}ms · {fmtRelative(log.created_at)}
```
改为：
```jsx
{log.owner_email} · {log.model} · {log.display_latency_ms || "—"}ms · {fmtRelative(log.created_at)}
```

- [ ] **Step 3: 修改 `frontend/src/components/dashboard-widgets.jsx`**

第 136 行，将：
```jsx
<td style={{ ...td, fontFamily: "var(--font-mono)" }}>{r.latency_ms ? r.latency_ms + "ms" : "—"}</td>
```
改为：
```jsx
<td style={{ ...td, fontFamily: "var(--font-mono)" }}>{r.display_latency_ms ? r.display_latency_ms + "ms" : "—"}</td>
```

- [ ] **Step 4: 运行前端测试**

```bash
cd frontend && npm test
```

期望：全部 PASS（现有测试用 mock 数据，mock 中无 `display_latency_ms` 字段，展示 `"—"` 是正常行为）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/dashboard/Logs.jsx frontend/src/pages/admin/Logs.jsx frontend/src/components/dashboard-widgets.jsx
git commit -m "feat(frontend): show display_latency_ms in log views (TTFB for streaming)"
```
