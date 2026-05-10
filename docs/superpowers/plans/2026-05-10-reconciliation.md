# 对账功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过 Anthropic Admin API 拉取上游 Key 的官方用量，与本地 `requestLogs` 逐 bucket 比对 token 差异，写入 `reconciliation_reports`，在管理后台以图表 + 表格形式展示。

**Architecture:** 后端新增 `reconciliation` 服务（拉取 Anthropic usage_report + 聚合本地 requestLogs + UPSERT 对比结果）和两个 admin 路由（POST /run、GET /reports）；`upstreamKeys` 表加两列（adminKeyCiphertext、anthropicKeyId），PATCH 路由支持更新这两列；前端新增对账页面（Recharts 图表 + 明细表格）并扩展上游密钥编辑弹窗。

**Tech Stack:** Hono、Drizzle ORM、Postgres、Vitest、React、Recharts（新增依赖）

> **成本对账说明：** Anthropic cost_report 端点不支持按 API key 过滤，因此本期 `anthropicCostUsd` 不从 cost_report 拉取，仅展示本地 `localCostUsd`（requestLogs.costUsd 汇总，含 markup）作为参考。状态判断（match/warn/mismatch）基于 token 数量差异。成本对账可在 Phase 2 通过 usage_report `group_by[]=model` + 价格表计算实现。

---

## 文件结构

### 新建
- `backend/src/db/migrations/0018_upstream_key_admin.sql` — 上游密钥表加两列
- `backend/src/db/migrations/0019_reconciliation_reports.sql` — 对账结果表
- `backend/src/services/reconciliation.ts` — 对账服务（拉取 + 聚合 + 比对）
- `backend/src/services/reconciliation.test.ts` — UT + CT
- `backend/src/routes/admin/reconciliation.ts` — POST /run + GET /reports
- `backend/src/tests/reconciliation.test.ts` — FT（完整 HTTP 栈）
- `frontend/src/pages/admin/Reconciliation.jsx` — 对账页面

### 修改
- `backend/src/db/schema.ts` — 新增两列 + reconciliationReports 表定义
- `backend/src/services/upstream-keys.ts` — patch() + toPublic() 包含新字段
- `backend/src/routes/admin/upstream-keys.ts` — PATCH zod schema 加新字段
- `backend/src/app.ts` — 注册 reconciliation 路由
- `frontend/src/App.jsx` — 新增 /admin/reconciliation 路由
- `frontend/src/pages/admin/UpstreamKeys.jsx` — KeyRow/编辑弹窗加两字段
- `frontend/package.json` — 新增 recharts

---

## Task 1: 数据库迁移 — upstreamKeys 新增两列

**Files:**
- Create: `backend/src/db/migrations/0018_upstream_key_admin.sql`

- [ ] **Step 1: 写迁移 SQL**

```sql
-- backend/src/db/migrations/0018_upstream_key_admin.sql
ALTER TABLE upstream_keys ADD COLUMN IF NOT EXISTS admin_key_ciphertext text;
ALTER TABLE upstream_keys ADD COLUMN IF NOT EXISTS anthropic_key_id text;
```

- [ ] **Step 2: 运行迁移**

```bash
cd backend
set -a && source .env && set +a
npx tsx src/db/migrate.ts
```

Expected: `Running migration: 0018_upstream_key_admin.sql` 无报错

- [ ] **Step 3: 验证列存在**

```bash
docker compose exec postgres psql -U postgres -d maplelink \
  -c "\d upstream_keys" | grep -E "admin_key|anthropic_key"
```

Expected: 出现 `admin_key_ciphertext | text` 和 `anthropic_key_id | text`

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/migrations/0018_upstream_key_admin.sql
git commit -m "feat(db): add admin_key_ciphertext and anthropic_key_id to upstream_keys"
```

---

## Task 2: 数据库迁移 — reconciliation_reports 表

**Files:**
- Create: `backend/src/db/migrations/0019_reconciliation_reports.sql`

- [ ] **Step 1: 写迁移 SQL**

```sql
-- backend/src/db/migrations/0019_reconciliation_reports.sql
CREATE TABLE IF NOT EXISTS reconciliation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upstream_key_id uuid NOT NULL REFERENCES upstream_keys(id) ON DELETE CASCADE,
  bucket_width text NOT NULL,
  bucket_at timestamp with time zone NOT NULL,
  local_input_tokens numeric,
  anthropic_input_tokens numeric,
  local_output_tokens numeric,
  anthropic_output_tokens numeric,
  local_cache_read_tokens numeric,
  anthropic_cache_read_tokens numeric,
  local_cache_write_tokens numeric,
  anthropic_cache_write_tokens numeric,
  local_cost_usd numeric(12,6),
  input_diff_pct numeric(8,4),
  output_diff_pct numeric(8,4),
  status text NOT NULL,
  ran_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_reports_key_width_bucket_idx
  ON reconciliation_reports(upstream_key_id, bucket_width, bucket_at);

CREATE INDEX IF NOT EXISTS reconciliation_reports_status_bucket_idx
  ON reconciliation_reports(status, bucket_at);
```

- [ ] **Step 2: 运行迁移**

```bash
cd backend
set -a && source .env && set +a
npx tsx src/db/migrate.ts
```

Expected: `Running migration: 0019_reconciliation_reports.sql` 无报错

- [ ] **Step 3: 验证表存在**

```bash
docker compose exec postgres psql -U postgres -d maplelink \
  -c "\d reconciliation_reports"
```

Expected: 列出所有列，包括 `bucket_width`、`bucket_at`、`status`

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/migrations/0019_reconciliation_reports.sql
git commit -m "feat(db): add reconciliation_reports table"
```

---

## Task 3: Schema 更新（Drizzle）

**Files:**
- Modify: `backend/src/db/schema.ts`

- [ ] **Step 1: 在 upstreamKeys 表定义中加两列**

在 `backend/src/db/schema.ts` 的 `upstreamKeys` 表，`createdAt` 前加入：

```typescript
  adminKeyCiphertext: text('admin_key_ciphertext'),
  anthropicKeyId: text('anthropic_key_id'),
```

- [ ] **Step 2: 在文件末尾加 reconciliationReports 表定义**

```typescript
export const reconciliationReports = pgTable('reconciliation_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  upstreamKeyId: uuid('upstream_key_id').notNull().references(() => upstreamKeys.id, { onDelete: 'cascade' }),
  bucketWidth: text('bucket_width').notNull(),
  bucketAt: timestamp('bucket_at', { withTimezone: true }).notNull(),
  localInputTokens: numeric('local_input_tokens'),
  anthropicInputTokens: numeric('anthropic_input_tokens'),
  localOutputTokens: numeric('local_output_tokens'),
  anthropicOutputTokens: numeric('anthropic_output_tokens'),
  localCacheReadTokens: numeric('local_cache_read_tokens'),
  anthropicCacheReadTokens: numeric('anthropic_cache_read_tokens'),
  localCacheWriteTokens: numeric('local_cache_write_tokens'),
  anthropicCacheWriteTokens: numeric('anthropic_cache_write_tokens'),
  localCostUsd: numeric('local_cost_usd', { precision: 12, scale: 6 }),
  inputDiffPct: numeric('input_diff_pct', { precision: 8, scale: 4 }),
  outputDiffPct: numeric('output_diff_pct', { precision: 8, scale: 4 }),
  status: text('status').notNull(),
  ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 3: 类型检查**

```bash
cd backend
set -a && source .env && set +a
npx tsc --noEmit
```

Expected: 无报错

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.ts
git commit -m "feat(schema): add admin key fields to upstreamKeys + reconciliationReports table"
```

---

## Task 4: 对账服务 — 纯逻辑函数（UT）

**Files:**
- Create: `backend/src/services/reconciliation.ts`
- Create: `backend/src/services/reconciliation.test.ts`

- [ ] **Step 1: 写失败的 UT**

```typescript
// backend/src/services/reconciliation.test.ts
import { describe, it, expect } from 'vitest'
import { diffPct, calcStatus } from './reconciliation.js'

describe('diffPct', () => {
  it('returns 0 when both are 0', () => {
    expect(diffPct(0, 0)).toBe(0)
  })
  it('returns null when anthropic=0 but local>0', () => {
    expect(diffPct(100, 0)).toBeNull()
  })
  it('returns positive pct when local > anthropic', () => {
    expect(diffPct(110, 100)).toBeCloseTo(10)
  })
  it('returns negative pct when local < anthropic', () => {
    expect(diffPct(90, 100)).toBeCloseTo(-10)
  })
})

describe('calcStatus', () => {
  it('match when all diffs < 0.1', () => {
    expect(calcStatus(0.05, 0.05, null)).toBe('match')
  })
  it('warn when any diff between 0.1 and 1', () => {
    expect(calcStatus(0.5, 0, null)).toBe('warn')
  })
  it('mismatch when any diff >= 1', () => {
    expect(calcStatus(1.5, 0, null)).toBe('mismatch')
  })
  it('ignores null diffs', () => {
    expect(calcStatus(null, null, null)).toBe('match')
  })
})
```

- [ ] **Step 2: 运行，确认失败**

```bash
cd backend
set -a && source .env && set +a
npx vitest run src/services/reconciliation.test.ts
```

Expected: `Cannot find module './reconciliation.js'`

- [ ] **Step 3: 创建服务文件，实现纯逻辑函数**

```typescript
// backend/src/services/reconciliation.ts
import { and, eq, gte, lt, sql, sum } from 'drizzle-orm'
import { db } from '../db/client.js'
import { reconciliationReports, requestLogs, upstreamKeys } from '../db/schema.js'
import { decryptSecret } from '../crypto/kms.js'
import { env } from '../env.js'
import { AppError } from '../shared/errors.js'

export type BucketWidth = '1d' | '1h'

export interface BucketData {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export function diffPct(local: number, anthropic: number): number | null {
  if (anthropic === 0 && local === 0) return 0
  if (anthropic === 0) return null
  return ((local - anthropic) / anthropic) * 100
}

export function calcStatus(
  inputDiff: number | null,
  outputDiff: number | null,
  _costDiff: number | null
): 'match' | 'warn' | 'mismatch' {
  const diffs = [inputDiff, outputDiff]
    .filter((d): d is number => d !== null)
    .map(Math.abs)
  if (diffs.length === 0) return 'match'
  const max = Math.max(...diffs)
  if (max < 0.1) return 'match'
  if (max < 1) return 'warn'
  return 'mismatch'
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd backend
set -a && source .env && set +a
npx vitest run src/services/reconciliation.test.ts
```

Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/reconciliation.ts backend/src/services/reconciliation.test.ts
git commit -m "feat(reconciliation): add diffPct and calcStatus pure logic with tests"
```

---

## Task 5: 对账服务 — Anthropic API 拉取 + 本地聚合（CT）

**Files:**
- Modify: `backend/src/services/reconciliation.ts`
- Modify: `backend/src/services/reconciliation.test.ts`

- [ ] **Step 1: 在 reconciliation.test.ts 末尾追加 CT**

```typescript
import { db } from '../db/client.js'
import { requestLogs, upstreamKeys, users } from '../db/schema.js'
import { beforeAll, afterAll } from 'vitest'
import { computeLocalUsage } from './reconciliation.js'
import { hashPassword } from '../crypto/password.js'

let testUpstreamKeyId: string
let testUserId: string

beforeAll(async () => {
  const [u] = await db.insert(users).values({
    email: `reconcile-ct-${Date.now()}@test.com`,
    passwordHash: await hashPassword('x'),
    name: 'ct',
    balanceUsd: '0',
  }).returning()
  testUserId = u!.id

  const [k] = await db.insert(upstreamKeys).values({
    alias: 'ct-key',
    keyCiphertext: 'dummy',
    keyPrefix: 'sk-ant-test',
    state: 'active',
    priority: '100',
    weight: 100,
  }).returning()
  testUpstreamKeyId = k!.id

  const base = new Date('2026-05-01T00:00:00Z')
  await db.insert(requestLogs).values([
    {
      id: `req_ct_rec_1`,
      userId: testUserId,
      apiKeyId: '00000000-0000-0000-0000-000000000001',
      upstreamKeyId: testUpstreamKeyId,
      model: 'claude-sonnet-4-6',
      upstreamModel: 'claude-sonnet-4-6',
      endpoint: '/v1/messages',
      stream: false,
      status: '200',
      latencyMs: '100',
      inputTokens: '1000',
      outputTokens: '500',
      cacheReadTokens: '200',
      cacheWriteTokens: '100',
      cacheWrite1hTokens: '0',
      costUsd: '0.01',
      requestHash: 'h1',
      upstreamRequestHash: 'uh1',
      auditMatch: true,
      createdAt: new Date('2026-05-01T10:00:00Z'),
    },
    {
      id: `req_ct_rec_2`,
      userId: testUserId,
      apiKeyId: '00000000-0000-0000-0000-000000000001',
      upstreamKeyId: testUpstreamKeyId,
      model: 'claude-sonnet-4-6',
      upstreamModel: 'claude-sonnet-4-6',
      endpoint: '/v1/messages',
      stream: false,
      status: '200',
      latencyMs: '100',
      inputTokens: '2000',
      outputTokens: '1000',
      cacheReadTokens: '0',
      cacheWriteTokens: '0',
      cacheWrite1hTokens: '0',
      costUsd: '0.02',
      requestHash: 'h2',
      upstreamRequestHash: 'uh2',
      auditMatch: true,
      createdAt: new Date('2026-05-01T22:00:00Z'),
    },
  ])
})

afterAll(async () => {
  await db.delete(requestLogs).where(eq(requestLogs.upstreamKeyId, testUpstreamKeyId))
  await db.delete(upstreamKeys).where(eq(upstreamKeys.id, testUpstreamKeyId))
  await db.delete(users).where(eq(users.id, testUserId))
})

describe('computeLocalUsage', () => {
  it('aggregates tokens by day', async () => {
    const result = await computeLocalUsage(
      testUpstreamKeyId,
      new Date('2026-05-01T00:00:00Z'),
      new Date('2026-05-02T00:00:00Z'),
      '1d'
    )
    expect(result.size).toBe(1)
    const bucket = result.get('2026-05-01T00:00:00.000Z')
    expect(bucket).toBeDefined()
    expect(bucket!.inputTokens).toBe(3000)
    expect(bucket!.outputTokens).toBe(1500)
    expect(bucket!.cacheReadTokens).toBe(200)
    expect(bucket!.cacheWriteTokens).toBe(100)
  })

  it('aggregates tokens by hour', async () => {
    const result = await computeLocalUsage(
      testUpstreamKeyId,
      new Date('2026-05-01T00:00:00Z'),
      new Date('2026-05-02T00:00:00Z'),
      '1h'
    )
    expect(result.size).toBe(2)
    const bucket10 = result.get('2026-05-01T10:00:00.000Z')
    expect(bucket10!.inputTokens).toBe(1000)
    const bucket22 = result.get('2026-05-01T22:00:00.000Z')
    expect(bucket22!.inputTokens).toBe(2000)
  })
})
```

- [ ] **Step 2: 运行，确认失败**

```bash
cd backend
set -a && source .env && set +a
npx vitest run src/services/reconciliation.test.ts
```

Expected: `computeLocalUsage is not a function`

- [ ] **Step 3: 在 reconciliation.ts 中实现 fetchAnthropicUsage 和 computeLocalUsage**

在 `reconciliation.ts` 的 `calcStatus` 函数后追加：

```typescript
interface AnthropicUsageRow {
  start_time: string
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  cache_creation_1h_input_tokens?: number
}

interface AnthropicUsageResponse {
  data: AnthropicUsageRow[]
  has_more: boolean
  next_page: string | null
}

export async function fetchAnthropicUsage(
  adminKey: string,
  anthropicKeyId: string,
  startAt: Date,
  endAt: Date,
  bucketWidth: BucketWidth
): Promise<Map<string, BucketData>> {
  const result = new Map<string, BucketData>()
  let nextPage: string | null = null

  do {
    const params = new URLSearchParams({
      starting_at: startAt.toISOString(),
      ending_at: endAt.toISOString(),
      bucket_width: bucketWidth,
    })
    params.append('api_key_ids[]', anthropicKeyId)
    if (nextPage) params.set('page', nextPage)

    const resp = await fetch(
      `https://api.anthropic.com/v1/organizations/usage_report/messages?${params}`,
      { headers: { 'anthropic-version': '2023-06-01', 'x-api-key': adminKey } }
    )
    if (!resp.ok) {
      const body = await resp.text()
      throw new AppError('upstream_error', { cause: `Anthropic Admin API ${resp.status}: ${body}` })
    }
    const data = await resp.json() as AnthropicUsageResponse

    for (const row of data.data) {
      const existing = result.get(row.start_time)
      const cacheWrite = (row.cache_creation_input_tokens ?? 0) + (row.cache_creation_1h_input_tokens ?? 0)
      if (existing) {
        existing.inputTokens += row.input_tokens
        existing.outputTokens += row.output_tokens
        existing.cacheReadTokens += row.cache_read_input_tokens
        existing.cacheWriteTokens += cacheWrite
      } else {
        result.set(row.start_time, {
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
          cacheReadTokens: row.cache_read_input_tokens,
          cacheWriteTokens: cacheWrite,
        })
      }
    }
    nextPage = data.next_page
  } while (nextPage)

  return result
}

export async function computeLocalUsage(
  upstreamKeyId: string,
  startAt: Date,
  endAt: Date,
  bucketWidth: BucketWidth
): Promise<Map<string, BucketData & { costUsd: number }>> {
  const truncUnit = bucketWidth === '1h' ? 'hour' : 'day'
  const bucketExpr = sql<string>`date_trunc(${truncUnit}, ${requestLogs.createdAt} AT TIME ZONE 'UTC')`

  const rows = await db
    .select({
      bucket: bucketExpr,
      inputTokens: sum(requestLogs.inputTokens),
      outputTokens: sum(requestLogs.outputTokens),
      cacheReadTokens: sum(requestLogs.cacheReadTokens),
      cacheWriteTokens: sum(sql`${requestLogs.cacheWriteTokens} + ${requestLogs.cacheWrite1hTokens}`),
      costUsd: sum(requestLogs.costUsd),
    })
    .from(requestLogs)
    .where(and(
      eq(requestLogs.upstreamKeyId, upstreamKeyId),
      gte(requestLogs.createdAt, startAt),
      lt(requestLogs.createdAt, endAt),
    ))
    .groupBy(bucketExpr)

  const result = new Map<string, BucketData & { costUsd: number }>()
  for (const row of rows) {
    result.set(new Date(row.bucket).toISOString(), {
      inputTokens: Number(row.inputTokens ?? '0'),
      outputTokens: Number(row.outputTokens ?? '0'),
      cacheReadTokens: Number(row.cacheReadTokens ?? '0'),
      cacheWriteTokens: Number(row.cacheWriteTokens ?? '0'),
      costUsd: Number(row.costUsd ?? '0'),
    })
  }
  return result
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd backend
set -a && source .env && set +a
npx vitest run src/services/reconciliation.test.ts
```

Expected: 所有测试 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/reconciliation.ts backend/src/services/reconciliation.test.ts
git commit -m "feat(reconciliation): add fetchAnthropicUsage and computeLocalUsage with CT"
```

---

## Task 6: 对账服务 — runReconciliation（CT）

**Files:**
- Modify: `backend/src/services/reconciliation.ts`
- Modify: `backend/src/services/reconciliation.test.ts`

- [ ] **Step 1: 在 reconciliation.test.ts 末尾追加对 runReconciliation 的测试**

```typescript
import { vi } from 'vitest'
import * as svc from './reconciliation.js'
import { encryptSecret } from '../crypto/kms.js'
import { reconciliationReports } from '../db/schema.js'
import { eq as drEq } from 'drizzle-orm'

describe('runReconciliation', () => {
  it('writes match report when tokens agree', async () => {
    // Give the upstream key a mock adminKeyCiphertext
    const adminKey = 'sk-ant-admin-test'
    const anthropicKeyId = 'apikey_01test'
    const ct = encryptSecret(adminKey, env.UPSTREAM_KEY_KMS)
    await db.update(upstreamKeys)
      .set({ adminKeyCiphertext: ct, anthropicKeyId })
      .where(eq(upstreamKeys.id, testUpstreamKeyId))

    // Stub fetchAnthropicUsage to return same data as local
    vi.spyOn(svc, 'fetchAnthropicUsage').mockResolvedValueOnce(
      new Map([['2026-05-01T00:00:00.000Z', {
        inputTokens: 3000, outputTokens: 1500,
        cacheReadTokens: 200, cacheWriteTokens: 100,
      }]])
    )

    await svc.runReconciliation(
      testUpstreamKeyId,
      new Date('2026-05-01T00:00:00Z'),
      new Date('2026-05-02T00:00:00Z'),
      '1d'
    )

    const [report] = await db.select()
      .from(reconciliationReports)
      .where(drEq(reconciliationReports.upstreamKeyId, testUpstreamKeyId))
    expect(report).toBeDefined()
    expect(report!.status).toBe('match')
    expect(Number(report!.inputDiffPct)).toBeCloseTo(0)

    vi.restoreAllMocks()
  })

  it('overwrites existing report on re-run (UPSERT)', async () => {
    vi.spyOn(svc, 'fetchAnthropicUsage').mockResolvedValue(
      new Map([['2026-05-01T00:00:00.000Z', {
        inputTokens: 6000, outputTokens: 1500,
        cacheReadTokens: 200, cacheWriteTokens: 100,
      }]])
    )

    await svc.runReconciliation(
      testUpstreamKeyId,
      new Date('2026-05-01T00:00:00Z'),
      new Date('2026-05-02T00:00:00Z'),
      '1d'
    )

    const reports = await db.select()
      .from(reconciliationReports)
      .where(drEq(reconciliationReports.upstreamKeyId, testUpstreamKeyId))
    expect(reports.length).toBe(1)
    expect(reports[0]!.status).toBe('mismatch')

    vi.restoreAllMocks()
  })
})
```

注意：在文件顶部 imports 中加入 `env` 和 `eq` 的导入：

```typescript
import { env } from '../env.js'
import { eq } from 'drizzle-orm'
```

- [ ] **Step 2: 运行，确认失败**

```bash
cd backend
set -a && source .env && set +a
npx vitest run src/services/reconciliation.test.ts
```

Expected: `runReconciliation is not a function`

- [ ] **Step 3: 在 reconciliation.ts 末尾实现 runReconciliation**

```typescript
export async function runReconciliation(
  upstreamKeyId: string,
  startAt: Date,
  endAt: Date,
  bucketWidth: BucketWidth
) {
  const [key] = await db.select().from(upstreamKeys).where(eq(upstreamKeys.id, upstreamKeyId))
  if (!key) throw new AppError('not_found')
  if (!key.adminKeyCiphertext || !key.anthropicKeyId) {
    throw new AppError('missing_fields', { cause: 'upstream key missing adminKeyCiphertext or anthropicKeyId' })
  }

  const adminKey = decryptSecret(key.adminKeyCiphertext, env.UPSTREAM_KEY_KMS)

  const [anthropicUsage, localUsage] = await Promise.all([
    fetchAnthropicUsage(adminKey, key.anthropicKeyId, startAt, endAt, bucketWidth),
    computeLocalUsage(upstreamKeyId, startAt, endAt, bucketWidth),
  ])

  const allBuckets = new Set([...anthropicUsage.keys(), ...localUsage.keys()])
  const reports: (typeof reconciliationReports.$inferInsert)[] = []

  for (const bucket of allBuckets) {
    const a = anthropicUsage.get(bucket) ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
    const l = localUsage.get(bucket) ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 }

    const inputDiff = diffPct(l.inputTokens, a.inputTokens)
    const outputDiff = diffPct(l.outputTokens, a.outputTokens)
    const status = calcStatus(inputDiff, outputDiff, null)

    reports.push({
      upstreamKeyId,
      bucketWidth,
      bucketAt: new Date(bucket),
      localInputTokens: String(l.inputTokens),
      anthropicInputTokens: String(a.inputTokens),
      localOutputTokens: String(l.outputTokens),
      anthropicOutputTokens: String(a.outputTokens),
      localCacheReadTokens: String(l.cacheReadTokens),
      anthropicCacheReadTokens: String(a.cacheReadTokens),
      localCacheWriteTokens: String(l.cacheWriteTokens),
      anthropicCacheWriteTokens: String(a.cacheWriteTokens),
      localCostUsd: String(l.costUsd),
      inputDiffPct: inputDiff !== null ? String(inputDiff) : null,
      outputDiffPct: outputDiff !== null ? String(outputDiff) : null,
      status,
    })
  }

  if (reports.length > 0) {
    await db.insert(reconciliationReports)
      .values(reports)
      .onConflictDoUpdate({
        target: [reconciliationReports.upstreamKeyId, reconciliationReports.bucketWidth, reconciliationReports.bucketAt],
        set: {
          localInputTokens: sql`excluded.local_input_tokens`,
          anthropicInputTokens: sql`excluded.anthropic_input_tokens`,
          localOutputTokens: sql`excluded.local_output_tokens`,
          anthropicOutputTokens: sql`excluded.anthropic_output_tokens`,
          localCacheReadTokens: sql`excluded.local_cache_read_tokens`,
          anthropicCacheReadTokens: sql`excluded.anthropic_cache_read_tokens`,
          localCacheWriteTokens: sql`excluded.local_cache_write_tokens`,
          anthropicCacheWriteTokens: sql`excluded.anthropic_cache_write_tokens`,
          localCostUsd: sql`excluded.local_cost_usd`,
          inputDiffPct: sql`excluded.input_diff_pct`,
          outputDiffPct: sql`excluded.output_diff_pct`,
          status: sql`excluded.status`,
          ranAt: sql`now()`,
        },
      })
  }

  return reports
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
cd backend
set -a && source .env && set +a
npx vitest run src/services/reconciliation.test.ts
```

Expected: 所有测试 PASS

- [ ] **Step 5: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无报错

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/reconciliation.ts backend/src/services/reconciliation.test.ts
git commit -m "feat(reconciliation): implement runReconciliation with UPSERT logic and CT"
```

---

## Task 7: 后端路由 — reconciliation（FT）

**Files:**
- Create: `backend/src/routes/admin/reconciliation.ts`
- Create: `backend/src/tests/reconciliation.test.ts`

- [ ] **Step 1: 写 FT**

```typescript
// backend/src/tests/reconciliation.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createApp } from '../app.js'
import { db } from '../db/client.js'
import { users, upstreamKeys, reconciliationReports } from '../db/schema.js'
import { hashPassword } from '../crypto/password.js'
import { encryptSecret } from '../crypto/kms.js'
import { env } from '../env.js'
import * as reconSvc from '../services/reconciliation.js'

const app = createApp()
let adminCookie = ''
let upstreamKeyId = ''
let userId = ''

beforeAll(async () => {
  const [u] = await db.insert(users).values({
    email: `recon-ft-${Date.now()}@test.com`,
    passwordHash: await hashPassword('pass123'),
    name: 'admin',
    role: 'admin',
    balanceUsd: '0',
  }).returning()
  userId = u!.id

  const loginResp = await app.fetch(new Request('http://localhost/api/console/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u!.email, password: 'pass123' }),
  }))
  adminCookie = loginResp.headers.get('set-cookie') ?? ''

  const ct = encryptSecret('sk-ant-admin-fake', env.UPSTREAM_KEY_KMS)
  const [k] = await db.insert(upstreamKeys).values({
    alias: 'recon-test-key',
    keyCiphertext: encryptSecret('sk-ant-api-fake', env.UPSTREAM_KEY_KMS),
    keyPrefix: 'sk-ant-api-fa',
    adminKeyCiphertext: ct,
    anthropicKeyId: 'apikey_01test',
    state: 'active',
    priority: '100',
    weight: 100,
  }).returning()
  upstreamKeyId = k!.id
})

afterAll(async () => {
  if (upstreamKeyId) {
    await db.delete(reconciliationReports).where(eq(reconciliationReports.upstreamKeyId, upstreamKeyId))
    await db.delete(upstreamKeys).where(eq(upstreamKeys.id, upstreamKeyId))
  }
  if (userId) await db.delete(users).where(eq(users.id, userId))
})

describe('POST /api/admin/reconciliation/run', () => {
  it('rejects non-admin', async () => {
    const resp = await app.fetch(new Request('http://localhost/api/admin/reconciliation/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startAt: '2026-05-01T00:00:00Z', endAt: '2026-05-02T00:00:00Z', bucketWidth: '1d' }),
    }))
    expect(resp.status).toBe(401)
  })

  it('validates 1h cannot exceed 7 days', async () => {
    const resp = await app.fetch(new Request('http://localhost/api/admin/reconciliation/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        startAt: '2026-05-01T00:00:00Z',
        endAt: '2026-05-15T00:00:00Z',
        bucketWidth: '1h',
      }),
    }))
    expect(resp.status).toBe(400)
  })

  it('runs reconciliation with mocked Anthropic API', async () => {
    vi.spyOn(reconSvc, 'fetchAnthropicUsage').mockResolvedValueOnce(new Map())

    const resp = await app.fetch(new Request('http://localhost/api/admin/reconciliation/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        upstreamKeyIds: [upstreamKeyId],
        startAt: '2026-05-01T00:00:00Z',
        endAt: '2026-05-02T00:00:00Z',
        bucketWidth: '1d',
      }),
    }))
    expect(resp.status).toBe(200)
    const body = await resp.json() as any
    expect(body).toHaveProperty('results')
    vi.restoreAllMocks()
  })
})

describe('GET /api/admin/reconciliation/reports', () => {
  it('returns paginated results', async () => {
    const resp = await app.fetch(new Request(
      `http://localhost/api/admin/reconciliation/reports?upstreamKeyId=${upstreamKeyId}`,
      { headers: { cookie: adminCookie } }
    ))
    expect(resp.status).toBe(200)
    const body = await resp.json() as any
    expect(body).toHaveProperty('reports')
    expect(body).toHaveProperty('total')
  })
})
```

- [ ] **Step 2: 运行，确认失败**

```bash
cd backend
set -a && source .env && set +a
npx vitest run src/tests/reconciliation.test.ts
```

Expected: 404 （路由未注册）

- [ ] **Step 3: 创建路由文件**

```typescript
// backend/src/routes/admin/reconciliation.ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import { runReconciliation } from '../../services/reconciliation.js'
import { db } from '../../db/client.js'
import { reconciliationReports, upstreamKeys } from '../../db/schema.js'
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { AppError } from '../../shared/errors.js'

export const reconciliationRoutes = new Hono()
reconciliationRoutes.use('*', requireBearer, requireAdmin)

const runBody = z.object({
  upstreamKeyIds: z.array(z.string().uuid()).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  bucketWidth: z.enum(['1d', '1h']),
})

reconciliationRoutes.post('/run', zValidator('json', runBody), async (c) => {
  const { upstreamKeyIds, startAt, endAt, bucketWidth } = c.req.valid('json')

  const start = new Date(startAt)
  const end = new Date(endAt)
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)

  if (bucketWidth === '1h' && diffDays > 7) {
    throw new AppError('validation_error', { cause: '1h granularity supports at most 7 days' })
  }
  if (bucketWidth === '1d' && diffDays > 31) {
    throw new AppError('validation_error', { cause: '1d granularity supports at most 31 days' })
  }

  let keyIds: string[]
  if (upstreamKeyIds && upstreamKeyIds.length > 0) {
    keyIds = upstreamKeyIds
  } else {
    const keys = await db.select({ id: upstreamKeys.id })
      .from(upstreamKeys)
      .where(sql`${upstreamKeys.adminKeyCiphertext} IS NOT NULL AND ${upstreamKeys.anthropicKeyId} IS NOT NULL`)
    keyIds = keys.map((k) => k.id)
  }

  const allResults = []
  for (const keyId of keyIds) {
    const results = await runReconciliation(keyId, start, end, bucketWidth)
    allResults.push(...results)
  }

  return c.json({ results: allResults })
})

const reportsQuery = z.object({
  upstreamKeyId: z.string().uuid().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  bucketWidth: z.enum(['1d', '1h']).optional(),
  status: z.enum(['match', 'warn', 'mismatch']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
})

reconciliationRoutes.get('/reports', zValidator('query', reportsQuery), async (c) => {
  const { upstreamKeyId, startAt, endAt, bucketWidth, status, page, pageSize } = c.req.valid('query')

  const conditions = []
  if (upstreamKeyId) conditions.push(eq(reconciliationReports.upstreamKeyId, upstreamKeyId))
  if (startAt) conditions.push(gte(reconciliationReports.bucketAt, new Date(startAt)))
  if (endAt) conditions.push(lte(reconciliationReports.bucketAt, new Date(endAt)))
  if (bucketWidth) conditions.push(eq(reconciliationReports.bucketWidth, bucketWidth))
  if (status) conditions.push(eq(reconciliationReports.status, status))

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(reconciliationReports)
    .where(where)

  const reports = await db
    .select({
      id: reconciliationReports.id,
      upstreamKeyId: reconciliationReports.upstreamKeyId,
      upstreamKeyAlias: upstreamKeys.alias,
      bucketWidth: reconciliationReports.bucketWidth,
      bucketAt: reconciliationReports.bucketAt,
      localInputTokens: reconciliationReports.localInputTokens,
      anthropicInputTokens: reconciliationReports.anthropicInputTokens,
      localOutputTokens: reconciliationReports.localOutputTokens,
      anthropicOutputTokens: reconciliationReports.anthropicOutputTokens,
      localCacheReadTokens: reconciliationReports.localCacheReadTokens,
      anthropicCacheReadTokens: reconciliationReports.anthropicCacheReadTokens,
      localCacheWriteTokens: reconciliationReports.localCacheWriteTokens,
      anthropicCacheWriteTokens: reconciliationReports.anthropicCacheWriteTokens,
      localCostUsd: reconciliationReports.localCostUsd,
      inputDiffPct: reconciliationReports.inputDiffPct,
      outputDiffPct: reconciliationReports.outputDiffPct,
      status: reconciliationReports.status,
      ranAt: reconciliationReports.ranAt,
    })
    .from(reconciliationReports)
    .leftJoin(upstreamKeys, eq(reconciliationReports.upstreamKeyId, upstreamKeys.id))
    .where(where)
    .orderBy(desc(reconciliationReports.bucketAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return c.json({ reports, total, page, pageSize })
})
```

- [ ] **Step 4: 注册路由到 app.ts**

在 `backend/src/app.ts` 的 import 区块末尾追加：

```typescript
import { reconciliationRoutes } from './routes/admin/reconciliation.js'
```

在 `app.route('/api/admin/settings', adminSettingsRoutes)` 后追加：

```typescript
app.route('/api/admin/reconciliation', reconciliationRoutes)
```

- [ ] **Step 5: 运行 FT，确认通过**

```bash
cd backend
set -a && source .env && set +a
npx vitest run src/tests/reconciliation.test.ts
```

Expected: 所有测试 PASS

- [ ] **Step 6: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 无报错

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/admin/reconciliation.ts backend/src/tests/reconciliation.test.ts backend/src/app.ts
git commit -m "feat(reconciliation): add admin routes POST /run and GET /reports with FT"
```

---

## Task 8: 上游密钥 PATCH 支持 adminKey + anthropicKeyId

**Files:**
- Modify: `backend/src/services/upstream-keys.ts`
- Modify: `backend/src/routes/admin/upstream-keys.ts`

- [ ] **Step 1: 在 services/upstream-keys.ts 的 patch() 函数扩展**

将现有 `patch()` 函数替换为：

```typescript
export async function patch(id: string, p: {
  alias?: string
  state?: 'active' | 'cooldown' | 'disabled'
  priority?: number
  weight?: number
  adminKey?: string
  anthropicKeyId?: string
}) {
  const updates: Partial<typeof upstreamKeys.$inferInsert> = {}
  if (p.alias !== undefined) updates.alias = p.alias
  if (p.state !== undefined) updates.state = p.state
  if (p.priority !== undefined) updates.priority = String(p.priority)
  if (p.weight !== undefined) updates.weight = p.weight
  if (p.anthropicKeyId !== undefined) updates.anthropicKeyId = p.anthropicKeyId
  if (p.adminKey !== undefined) {
    const key = p.adminKey.trim()
    if (!key) throw new AppError('missing_fields')
    updates.adminKeyCiphertext = encryptSecret(key, env.UPSTREAM_KEY_KMS)
  }

  const [row] = await db.update(upstreamKeys).set(updates).where(eq(upstreamKeys.id, id)).returning()
  if (!row) throw new AppError('not_found')
  return row
}
```

注意：需要在文件顶部补充 import（encryptSecret 已经 import 了吗？看现有 upstream-keys.ts，`encryptSecret` 已经 imported from `'../crypto/kms.ts'`）。确认 import 语句已存在，否则加上：

```typescript
import { encryptSecret, decryptSecret } from '../crypto/kms.js'
```

- [ ] **Step 2: 在 toPublic() 中排除 adminKeyCiphertext**

将现有 `toPublic` 函数替换为：

```typescript
export function toPublic(row: UpstreamRow): Omit<UpstreamRow, 'keyCiphertext' | 'adminKeyCiphertext'> & { hasAdminKey: boolean } {
  const { keyCiphertext: _k, adminKeyCiphertext: _a, ...rest } = row
  return { ...rest, hasAdminKey: !!row.adminKeyCiphertext }
}
```

同时更新类型别名：

```typescript
export type UpstreamPublic = ReturnType<typeof toPublic>
```

- [ ] **Step 3: 扩展路由的 PATCH zod schema**

在 `backend/src/routes/admin/upstream-keys.ts` 中，将现有 PATCH handler 的 zValidator schema 替换为：

```typescript
upstreamKeysRoutes.patch('/:id', zValidator('json', z.object({
  alias: z.string().optional(),
  state: z.enum(['active', 'cooldown', 'disabled']).optional(),
  priority: z.number().int().optional(),
  weight: z.number().int().nonnegative().optional(),
  admin_key: z.string().optional(),
  anthropic_key_id: z.string().optional(),
})), async (c) => {
  const id = c.req.param('id')
  const b = c.req.valid('json')
  const row = await svc.patch(id, {
    alias: b.alias,
    state: b.state,
    priority: b.priority,
    weight: b.weight,
    adminKey: b.admin_key,
    anthropicKeyId: b.anthropic_key_id,
  })
  await audit.record({
    actor: c.get('user'),
    action: 'admin.upstream_key.update',
    target: row.alias,
    metadata: { id, patch: { ...b, admin_key: b.admin_key ? '[redacted]' : undefined } },
  })
  return c.json(svc.toPublic(row))
})
```

- [ ] **Step 4: 类型检查 + 全量测试**

```bash
cd backend
set -a && source .env && set +a
npx tsc --noEmit
npm test
```

Expected: 无类型错误，所有测试 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/upstream-keys.ts backend/src/routes/admin/upstream-keys.ts
git commit -m "feat(upstream-keys): PATCH supports adminKey and anthropicKeyId"
```

---

## Task 9: 前端安装 recharts + 上游密钥编辑弹窗扩展

**Files:**
- Modify: `frontend/package.json`（通过 npm install）
- Modify: `frontend/src/pages/admin/UpstreamKeys.jsx`

- [ ] **Step 1: 安装 recharts**

```bash
cd frontend && npm install recharts
```

Expected: `recharts` 出现在 `package.json` dependencies

- [ ] **Step 2: 了解 UpstreamKeys.jsx 现有编辑 UI**

```bash
grep -n "alias\|admin_key\|anthropic\|KeyRow\|editId\|modal\|dialog\|form" \
  frontend/src/pages/admin/UpstreamKeys.jsx | head -40
```

根据输出确认编辑逻辑位置（inline 编辑 or modal）。

- [ ] **Step 3: 在 UpstreamKeys.jsx 的 KeyRow 组件添加 Admin Key 和 Anthropic Key ID 字段**

找到处理 PATCH 的编辑逻辑（通常是一个 state + 表单）。添加以下 state 和字段：

在 `KeyRow` 组件的 state 部分新增：

```jsx
const [editAdminKey, setEditAdminKey] = useState('')
const [editAnthropicKeyId, setEditAnthropicKeyId] = useState(row.anthropicKeyId ?? '')
```

在保存时调用 PATCH，追加字段：

```jsx
const body = { alias: editAlias }
if (editAdminKey) body.admin_key = editAdminKey
if (editAnthropicKeyId !== row.anthropicKeyId) body.anthropic_key_id = editAnthropicKeyId

await api(`/api/admin/upstream-keys/${row.id}`, { method: 'PATCH', body })
```

在编辑表单 UI 中追加两个输入框（放在现有字段之后）：

```jsx
<div>
  <label className="block text-xs text-gray-500 mb-1">
    Admin API Key（更新才填，留空保持不变）
  </label>
  <input
    type="password"
    placeholder="sk-ant-admin..."
    value={editAdminKey}
    onChange={(e) => setEditAdminKey(e.target.value)}
    className="w-full border rounded px-2 py-1 text-sm font-mono"
  />
</div>
<div>
  <label className="block text-xs text-gray-500 mb-1">
    Anthropic Key ID
  </label>
  <input
    type="text"
    placeholder="apikey_01..."
    value={editAnthropicKeyId}
    onChange={(e) => setEditAnthropicKeyId(e.target.value)}
    className="w-full border rounded px-2 py-1 text-sm font-mono"
  />
  <p className="text-xs text-gray-400 mt-1">
    从 Anthropic Console → Settings → API Keys 复制
  </p>
</div>
```

在非编辑态的行显示中，显示 Admin Key 状态：

```jsx
{row.hasAdminKey
  ? <span className="text-xs text-green-600">Admin Key 已配置</span>
  : <span className="text-xs text-gray-400">无 Admin Key</span>}
```

- [ ] **Step 4: 全量前端测试**

```bash
cd frontend && npm test
```

Expected: 所有测试 PASS（若 UpstreamKeys.test.jsx 有相关用例需同步更新）

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/pages/admin/UpstreamKeys.jsx
git commit -m "feat(frontend): install recharts + upstream key edit with admin key fields"
```

---

## Task 10: 前端对账页面

**Files:**
- Create: `frontend/src/pages/admin/Reconciliation.jsx`

- [ ] **Step 1: 创建对账页面**

```jsx
// frontend/src/pages/admin/Reconciliation.jsx
import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts'
import { api } from '../../lib/api.js'

const STATUS_COLOR = { match: 'text-green-600', warn: 'text-yellow-600', mismatch: 'text-red-600' }
const STATUS_BG = { match: 'bg-green-50', warn: 'bg-yellow-50', mismatch: 'bg-red-50' }

function fmt(n) {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  return isNaN(num) ? '—' : num.toFixed(2) + '%'
}

function fmtTokens(n) {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString()
}

export default function Reconciliation() {
  const [upstreamKeys, setUpstreamKeys] = useState([])
  const [selectedKeys, setSelectedKeys] = useState([])
  const [bucketWidth, setBucketWidth] = useState('1d')
  const [startAt, setStartAt] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10)
  })
  const [endAt, setEndAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [statusFilter, setStatusFilter] = useState('')
  const [running, setRunning] = useState(false)
  const [reports, setReports] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/admin/upstream-keys').then((data) => {
      const withAdmin = (data.upstream_keys ?? []).filter((k) => k.hasAdminKey)
      setUpstreamKeys(withAdmin)
      setSelectedKeys(withAdmin.map((k) => k.id))
    })
  }, [])

  // Clamp date range when bucket width changes
  useEffect(() => {
    const maxDays = bucketWidth === '1h' ? 7 : 31
    const start = new Date(startAt)
    const end = new Date(endAt)
    const diffDays = (end - start) / (1000 * 60 * 60 * 24)
    if (diffDays > maxDays) {
      const newStart = new Date(end)
      newStart.setDate(newStart.getDate() - maxDays)
      setStartAt(newStart.toISOString().slice(0, 10))
    }
  }, [bucketWidth])

  const fetchReports = useCallback(async (p = 1) => {
    const params = new URLSearchParams({ page: p, pageSize: 50 })
    if (selectedKeys.length === 1) params.set('upstreamKeyId', selectedKeys[0])
    if (bucketWidth) params.set('bucketWidth', bucketWidth)
    if (statusFilter) params.set('status', statusFilter)
    params.set('startAt', new Date(startAt).toISOString())
    params.set('endAt', new Date(endAt + 'T23:59:59Z').toISOString())
    const data = await api(`/api/admin/reconciliation/reports?${params}`)
    setReports(data.reports ?? [])
    setTotal(data.total ?? 0)
    setPage(p)
  }, [selectedKeys, bucketWidth, statusFilter, startAt, endAt])

  const handleRun = async () => {
    setRunning(true)
    setError('')
    try {
      await api('/api/admin/reconciliation/run', {
        method: 'POST',
        body: {
          upstreamKeyIds: selectedKeys,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt + 'T23:59:59Z').toISOString(),
          bucketWidth,
        },
      })
      await fetchReports(1)
    } catch (e) {
      setError(e.message ?? '对账失败')
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => { fetchReports(1) }, [fetchReports])

  // Chart data: token diff trend
  const trendData = reports.map((r) => ({
    bucket: bucketWidth === '1d'
      ? r.bucketAt.slice(0, 10)
      : r.bucketAt.slice(0, 16).replace('T', ' '),
    input: Number(r.inputDiffPct ?? 0),
    output: Number(r.outputDiffPct ?? 0),
    alias: r.upstreamKeyAlias,
  }))

  // Chart data: status distribution per key
  const statusByKey = {}
  for (const r of reports) {
    const alias = r.upstreamKeyAlias ?? r.upstreamKeyId.slice(0, 8)
    if (!statusByKey[alias]) statusByKey[alias] = { alias, match: 0, warn: 0, mismatch: 0 }
    statusByKey[alias][r.status]++
  }
  const keyStatusData = Object.values(statusByKey)

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">对账</h1>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end bg-white border rounded-lg p-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">粒度</label>
          <select
            value={bucketWidth}
            onChange={(e) => setBucketWidth(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="1d">按天（最多31天）</option>
            <option value="1h">按小时（最多7天）</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">开始日期</label>
          <input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)}
            className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">结束日期</label>
          <input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)}
            className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">上游 Key</label>
          <select
            multiple
            value={selectedKeys}
            onChange={(e) => setSelectedKeys([...e.target.selectedOptions].map((o) => o.value))}
            className="border rounded px-2 py-1 text-sm min-w-[160px]"
            size={Math.min(upstreamKeys.length + 1, 4)}
          >
            {upstreamKeys.map((k) => (
              <option key={k.id} value={k.id}>{k.alias}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">状态筛选</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded px-2 py-1 text-sm">
            <option value="">全部</option>
            <option value="match">match</option>
            <option value="warn">warn</option>
            <option value="mismatch">mismatch</option>
          </select>
        </div>
        <button
          onClick={handleRun}
          disabled={running || selectedKeys.length === 0}
          className="px-4 py-1.5 bg-black text-white rounded text-sm disabled:opacity-50"
        >
          {running ? '执行中…' : '执行对账'}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {/* Chart 1: Token diff trend */}
      {trendData.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-sm font-medium mb-3">Token 差异趋势（%）</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => v + '%'} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => v.toFixed(3) + '%'} />
              <Legend />
              <Line type="monotone" dataKey="input" name="Input 差异%" stroke="#6366f1" dot={false} />
              <Line type="monotone" dataKey="output" name="Output 差异%" stroke="#f59e0b" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Chart 2: Status distribution per key */}
      {keyStatusData.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-sm font-medium mb-3">各上游 Key 对账状态分布</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={keyStatusData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="alias" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="match" name="match" stackId="a" fill="#22c55e" />
              <Bar dataKey="warn" name="warn" stackId="a" fill="#eab308" />
              <Bar dataKey="mismatch" name="mismatch" stackId="a" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Detail table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b text-sm text-gray-500">
          共 {total} 条记录，当前显示第 {page} 页
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">时间 bucket</th>
                <th className="px-3 py-2 text-left">上游 Key</th>
                <th className="px-3 py-2 text-right">Input 差异%</th>
                <th className="px-3 py-2 text-right">Output 差异%</th>
                <th className="px-3 py-2 text-right">本地 Input</th>
                <th className="px-3 py-2 text-right">Anthropic Input</th>
                <th className="px-3 py-2 text-right">本地 Output</th>
                <th className="px-3 py-2 text-right">Anthropic Output</th>
                <th className="px-3 py-2 text-center">状态</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className={`border-t ${STATUS_BG[r.status] ?? ''}`}>
                  <td className="px-3 py-2 font-mono text-xs">
                    {bucketWidth === '1d' ? r.bucketAt.slice(0, 10) : r.bucketAt.slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="px-3 py-2">{r.upstreamKeyAlias ?? r.upstreamKeyId.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(r.inputDiffPct)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(r.outputDiffPct)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtTokens(r.localInputTokens)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtTokens(r.anthropicInputTokens)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtTokens(r.localOutputTokens)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtTokens(r.anthropicOutputTokens)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs font-medium ${STATUS_COLOR[r.status] ?? ''}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
              {reports.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">暂无对账记录</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {total > 50 && (
          <div className="px-4 py-3 border-t flex gap-2">
            <button onClick={() => fetchReports(page - 1)} disabled={page === 1}
              className="px-3 py-1 border rounded text-sm disabled:opacity-40">上一页</button>
            <button onClick={() => fetchReports(page + 1)} disabled={page * 50 >= total}
              className="px-3 py-1 border rounded text-sm disabled:opacity-40">下一页</button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/admin/Reconciliation.jsx
git commit -m "feat(frontend): add Reconciliation admin page with charts and table"
```

---

## Task 11: 前端路由注册

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: 在 App.jsx 中导入并注册路由**

在 App.jsx 的 admin imports 区块（参考现有 `import UpstreamKeys from './pages/admin/UpstreamKeys.jsx'` 的位置）追加：

```jsx
import Reconciliation from './pages/admin/Reconciliation.jsx'
```

在 `/admin/upstream-keys` route 之后追加：

```jsx
<Route path="reconciliation" element={<Reconciliation />} />
```

- [ ] **Step 2: 前端测试**

```bash
cd frontend && npm test
```

Expected: 所有测试 PASS

- [ ] **Step 3: 全量后端测试**

```bash
cd backend
set -a && source .env && set +a
npx tsc --noEmit && npm test
```

Expected: 无类型错误，所有测试 PASS

- [ ] **Step 4: 最终 commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(frontend): register /admin/reconciliation route"
```

---

## 验收清单

- [ ] 迁移 0018、0019 运行无错
- [ ] `upstreamKeys` 表含 `admin_key_ciphertext`、`anthropic_key_id` 两列
- [ ] `reconciliation_reports` 表含唯一索引 `(upstream_key_id, bucket_width, bucket_at)`
- [ ] `POST /api/admin/reconciliation/run` 正确验证时间跨度限制（1h≤7天，1d≤31天）
- [ ] 重复对账同一日期范围会 UPSERT（不重复写入）
- [ ] `GET /api/admin/reconciliation/reports` 支持按 upstreamKeyId、status、bucketWidth 筛选
- [ ] 上游密钥 PATCH 接受 `admin_key` 和 `anthropic_key_id`，Admin Key 加密存储、不回显
- [ ] 前端对账页面：粒度切换时自动收窄日期范围
- [ ] 前端对账页面：Token 差异趋势折线图 + Key 状态分布柱状图正确渲染
- [ ] `npm test`（后端）全量通过
- [ ] `npm test`（前端）全量通过
- [ ] `npx tsc --noEmit` 无报错
