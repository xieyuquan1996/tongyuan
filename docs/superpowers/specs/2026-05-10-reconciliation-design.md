# 对账功能设计 — Anthropic Admin API 用量对账

## 背景

MapleLink 使用多个上游 Anthropic API Key（分属不同 Anthropic 组织）代理用户请求，并在本地 `requestLogs` 中记录每条请求的 token 用量和成本。

目前无法验证 MapleLink 本地统计与 Anthropic 实际计费是否一致。本功能通过 Anthropic Admin API 拉取官方用量数据，与本地记录对比，帮助管理员发现 token 统计偏差或计费异常。

## 对账粒度

支持两种粒度，由管理员在执行对账时选择：

| 粒度 | bucket_width | 本地 SQL | Anthropic 限制 | 适用场景 |
|------|-------------|---------|--------------|--------|
| 按天 | `1d` | `date_trunc('day', created_at)` | 最多 31 天 | 月度对账、长期趋势 |
| 按小时 | `1h` | `date_trunc('hour', created_at)` | 最多 7 天（168 buckets） | 排查短期异常 |

注意：cost_report 仅支持 `1d`，因此按小时对账时费用差异列不可用（显示 N/A）。

## 对账逻辑

对每一个配置了 Admin Key 的上游 Anthropic Key，按选定粒度执行：

1. 调 Anthropic Admin API `GET /v1/organizations/usage_report/messages`，按 `api_key_ids` 过滤，使用选定 `bucket_width`，拉取 input/output/cache_read/cache_write tokens
2. 若粒度为 `1d`：调 `GET /v1/organizations/cost_report` 拉取每天实际费用（USD）
3. 从本地 `requestLogs` 按 `(upstreamKeyId, bucket)` 汇总相同维度
4. 逐 bucket 比对，写入 `reconciliation_reports`，标注差异状态

差异状态阈值：

| 状态 | 条件 |
|------|------|
| `match` | 所有 token 类型差异 < 0.1% |
| `warn` | 任意 token 类型差异 0.1%–1% |
| `mismatch` | 任意 token 类型差异 > 1% |

## 数据模型

### upstreamKeys 表新增列

| 列名 | 类型 | 说明 |
|------|------|------|
| `adminKeyCiphertext` | text, nullable | Admin API Key 密文，与 `keyCiphertext` 使用同一 KMS |
| `anthropicKeyId` | text, nullable | Anthropic Key ID（`apikey_01...`），用于 Admin API 的 `api_key_ids[]` 过滤 |

### reconciliation_reports 表（新建）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | uuid PK | |
| `upstreamKeyId` | uuid FK → upstreamKeys | |
| `bucketWidth` | text | `1d` 或 `1h` |
| `bucketAt` | timestamp with tz | bucket 起始时间（按天则为 00:00 UTC，按小时则为该小时 UTC） |
| `localInputTokens` | numeric | 本地统计 input tokens |
| `anthropicInputTokens` | numeric | Anthropic 报告 input tokens |
| `localOutputTokens` | numeric | |
| `anthropicOutputTokens` | numeric | |
| `localCacheReadTokens` | numeric | |
| `anthropicCacheReadTokens` | numeric | |
| `localCacheWriteTokens` | numeric | |
| `anthropicCacheWriteTokens` | numeric | |
| `localCostUsd` | numeric(12,6) | 本地 requestLogs 汇总 costUsd（按小时粒度时为 null） |
| `anthropicCostUsd` | numeric(12,6) | Anthropic cost_report（按小时粒度时为 null） |
| `inputDiffPct` | numeric(8,4) | input token 差异百分比 |
| `outputDiffPct` | numeric(8,4) | |
| `costDiffPct` | numeric(8,4) | null 当 cost 不可用 |
| `status` | text | `match` / `warn` / `mismatch` |
| `ranAt` | timestamp with tz | 本次对账执行时间 |

索引：`(upstreamKeyId, bucketWidth, bucketAt)`（唯一，UPSERT 冲突键），`(status, bucketAt)`

## 后端架构

### 新增服务：`src/services/reconciliation.ts`

```
fetchAnthropicUsage(adminKey, anthropicKeyId, startAt, endAt, bucketWidth: '1d'|'1h')
  → GET /v1/organizations/usage_report/messages
    params: api_key_ids[]=anthropicKeyId, bucket_width=bucketWidth, starting_at, ending_at
  → 若 bucketWidth === '1d'：额外调 GET /v1/organizations/cost_report（仅支持1d）
  → 返回 Map<bucketAt(ISO), { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, costUsd|null }>

computeLocalUsage(upstreamKeyId, startAt, endAt, bucketWidth: '1d'|'1h')
  → SELECT date_trunc($bucketWidth, created_at AT TIME ZONE 'UTC'),
           sum(input_tokens), sum(output_tokens),
           sum(cache_read_tokens), sum(cache_write_tokens), sum(cost_usd)
    FROM request_logs WHERE upstream_key_id = upstreamKeyId
      AND created_at >= startAt AND created_at < endAt
    GROUP BY 1

runReconciliation(upstreamKeyId, startAt, endAt, bucketWidth)
  → 解密 adminKeyCiphertext
  → 并行调 fetchAnthropicUsage + computeLocalUsage
  → 逐 bucket join，计算 diffPct，判断 status
  → UPSERT INTO reconciliation_reports（冲突键：upstreamKeyId + bucketWidth + bucketAt）
  → 返回结果列表
```

### 新增路由：`src/routes/admin/reconciliation.ts`

```
POST /api/admin/reconciliation/run
  body: {
    upstreamKeyIds?: string[],   // 空 = 全部有 adminKey 的 Key
    startAt: string,             // ISO 8601
    endAt: string,
    bucketWidth: '1d' | '1h'    // 对账粒度
  }
  → 验证：1h 模式下时间跨度不超过 7 天；1d 模式不超过 31 天
  → 返回 { results: ReconciliationReport[] }

GET /api/admin/reconciliation/reports
  query: { upstreamKeyId?, startAt?, endAt?, bucketWidth?, status?, page?, pageSize? }
  → 分页返回历史对账记录，附带 upstreamKey alias 字段
```

### 上游密钥管理扩展

`PUT /api/admin/upstream-keys/:id` 支持新增字段：
- `adminKey`（明文，后端用 KMS 加密后存 `adminKeyCiphertext`）
- `anthropicKeyId`（明文字符串，直接存储）

## 前端架构

### 上游密钥编辑弹窗

在现有表单新增两个字段：
- **Admin API Key**：password 类型输入框，占位符 `sk-ant-admin...`，提交后后端加密，回显时显示 `••••••` + 前 8 位
- **Anthropic Key ID**：文本输入框，占位符 `apikey_01...`，提示用户从 Anthropic console → API Keys 页面复制

### 新增「对账」页面（管理后台）

路由：`/admin/reconciliation`

#### 控制区（顶部）

| 控件 | 说明 |
|------|------|
| 粒度选择器 | 按天 / 按小时（单选，默认按天） |
| 日期范围选择器 | 默认最近 7 天；按小时时限制最多选 7 天，按天最多 31 天 |
| 上游 Key 多选 | 默认全选（仅显示已配置 Admin Key 的） |
| 状态筛选 | 全部 / match / warn / mismatch |
| 「执行对账」按钮 | 触发 POST /run，loading 状态 |

粒度切换时自动校验并收窄日期范围（若当前选择超出新粒度的限制）。

#### 图表区

**图表 1 — Token 差异趋势（折线图）**
- X 轴：bucketAt（按天显示日期，按小时显示"日期 HH:00"）
- Y 轴：差异百分比（%）
- 系列：input / output / cache（按 token 类型分色）
- 支持筛选：上游 Key（单选）、token 类型（多选）

**图表 2 — 各上游 Key 对账状态分布（柱状图）**
- X 轴：上游 Key alias
- Y 轴：记录数
- 分组：match / warn / mismatch（绿/黄/红堆叠）
- 点击某个 Key 可钻取到明细表格

**图表 3 — 费用差异对比（双轴折线图）**
- X 轴：日期
- 左 Y 轴：本地计费 costUsd
- 右 Y 轴：Anthropic 实际费用
- 支持上游 Key 筛选

所有图表使用 **Recharts**（需新增依赖 `recharts`），与 React 生态契合，API 声明式，bundle 大小合理。

#### 明细表格区（图表下方）

列：时间 bucket | 粒度 | 上游 Key | Input 差异% | Output 差异% | Cost 差异% | 状态标签 | 本地 tokens | Anthropic tokens

支持：按列排序、状态高亮（绿/黄/红行）、分页

## Anthropic Key ID 配置方式

管理员手动填写 `anthropicKeyId`（从 Anthropic console → Settings → API Keys 页面复制，格式 `apikey_01...`）。

不自动调 List API Keys 接口匹配，原因：不同组织的 Admin Key 权限不同，自动匹配逻辑易出错；手动填写一次即可，无持续维护成本。

## 测试计划

### UT（src/services/reconciliation.test.ts）
- `computeLocalUsage`：mock db，验证 token 汇总逻辑
- 差异百分比计算：边界值（0 除数、完全匹配、超阈值）
- `status` 判断：三段阈值

### CT（src/services/reconciliation.test.ts）
- 使用真实 test DB，插入 requestLogs fixture，验证汇总正确
- UPSERT 逻辑：重复运行同日期应覆盖而非新增

### FT（src/tests/reconciliation.test.ts）
- `POST /api/admin/reconciliation/run`：mock Anthropic Admin API（用 startMockUpstream 模式），验证写入 reconciliation_reports
- `GET /api/admin/reconciliation/reports`：验证筛选、分页、status 过滤
- 权限：非 admin 用户返回 403

### 前端 CT
- 对账页面：mock fetch，验证图表数据渲染、筛选交互
- 上游密钥弹窗：验证 Admin Key 字段不明文回显

## 不在本期范围

- 自动定时对账（后续可通过 cron job 扩展）
- 对账结果邮件通知（后续接现有告警系统）
- 支持非 Anthropic 上游（当前只有 `provider=anthropic_official`）
