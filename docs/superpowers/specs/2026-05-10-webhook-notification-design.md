# Webhook 通知渠道设计

Date: 2026-05-10

## Overview

在现有 `email` / `browser` 两个告警渠道基础上，新增 `webhook` 渠道。用户可在账户设置里配置全局 Webhook URL + Bearer Token，每条告警也可单独覆盖 URL。触发时向目标 URL 发送结构化 JSON payload，不重试，失败仅记录日志。

---

## 第 1 节：数据模型

### users 表新增列

```sql
webhook_url   text  -- 全局 Webhook URL（nullable）
webhook_token text  -- Bearer Token 明文（nullable）
```

### alerts 表新增列

```sql
webhook_url   text  -- 覆盖全局 URL（nullable，仅 channel='webhook' 时有意义）
```

### channel 枚举扩展

DB 层 `channel` 字段为 text，后端路由 Zod schema 扩展为：

```ts
const CHANNEL = z.enum(['browser', 'email', 'webhook'])
```

### 有效 URL 解析规则

```
effectiveUrl = alert.webhook_url ?? user.webhook_url
```

若 `effectiveUrl` 为 null / 空串，静默跳过（不报错，不发送）。

---

## 第 2 节：后端架构

### 修改/新增文件

| 文件 | 变更 |
|------|------|
| `backend/src/db/migrations/<next>.sql` | 新迁移：为 users / alerts 表添加 webhook_url、users.webhook_token 列 |
| `backend/src/db/schema.ts` | 更新 users / alerts 表 Drizzle 定义 |
| `backend/src/services/alert-notifier.ts` | 新增 webhook 分支，抽取 `_sendWebhook()` 辅助函数 |
| `backend/src/routes/console/alerts.ts` | CHANNEL 枚举加 `'webhook'`，create/patch schema 加 `webhookUrl?: string` |
| `backend/src/routes/console/me.ts` | GET 响应加 `webhook_url` / `webhook_token`；PATCH 支持更新这两个字段 |

### alert-notifier.ts — webhook 触发逻辑

新增 `_sendWebhook()` 函数，由 `_checkBilling` / `_checkRequest` 在 `channel === 'webhook'` 时调用：

```ts
async function _sendWebhook(
  alert: AlertRow,
  user: UserRow,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = alert.webhookUrl || user.webhookUrl
  if (!url) return

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (user.webhookToken) headers['Authorization'] = `Bearer ${user.webhookToken}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: alert.kind,
        threshold: Number(alert.threshold),
        ...payload,           // current_value, triggered_at 等
      }),
      signal: AbortSignal.timeout(10_000),  // 10 秒超时
    })
    if (!res.ok) {
      console.warn(`[alert-notifier] webhook ${alert.id} responded ${res.status}`)
    }
  } catch (err) {
    console.warn('[alert-notifier] webhook delivery failed', err)
  }
}
```

Payload 结构（各 kind 的 `current_value` 字段名保持语义化）：

| kind | payload 字段 |
|------|-------------|
| `balance_low` | `{ kind, threshold, current_balance, triggered_at }` |
| `spend_daily` | `{ kind, threshold, daily_spend, triggered_at }` |
| `error_rate` | `{ kind, threshold, error_rate, triggered_at }` |
| `p99_latency` | `{ kind, threshold, p99_ms, triggered_at }` |

`triggered_at` 为 ISO 8601 字符串。

**冷却机制**：和 email 一致，发送成功后写 Redis key `alert_sent:<id>`，TTL 3600 秒。

### me.ts — 全局 Webhook 设置

`GET /api/console/me` 响应新增字段：

```json
{
  "webhook_url": "https://...",
  "webhook_token": "***"   // 脱敏：有值则返回固定占位符，不暴露原文
}
```

`PATCH /api/console/me` 接受：

```json
{
  "webhook_url": "https://...",
  "webhook_token": "my-secret"   // 空串表示清除
}
```

**注意**：`webhook_token` 明文存储于 DB（Bearer Token 不是高敏感凭据，无加密需求；如将来需要可单独加迁移），GET 时返回脱敏占位符 `"••••••••"` 而非原文，避免前端意外暴露。

### alerts.ts — per-alert URL 覆盖

`POST /api/console/alerts` 和 `PATCH /api/console/alerts/:id` schema 新增可选字段：

```ts
webhookUrl: z.string().url().optional().or(z.literal(''))
```

空串表示清除覆盖（恢复使用全局 URL）。

---

## 第 3 节：前端交互

### Alerts.jsx

1. 启用 `CHANNELS` 中的 webhook 选项：

```js
const CHANNELS = [
  { id: "email",   label: "邮件" },
  { id: "browser", label: "浏览器推送" },
  { id: "webhook", label: "Webhook" },
]
```

2. 新增告警表单中，当 `channel === "webhook"` 时，在 channel 选择器下方出现 URL 输入框：
   - placeholder：`留空则使用全局 Webhook URL`
   - 值存入 `newAlert.webhookUrl`

3. 若 `channel === "webhook"` 且 per-alert URL 为空且全局 `webhookUrl` 也为空，显示 warning banner：
   > "Webhook URL 未配置。请前往 [账户设置](/dashboard/settings) 填写全局地址，或在此输入覆盖地址。"

4. 已有 webhook 告警的列表行，追加一列 URL 覆盖输入（inline 编辑，blur 时 PATCH）。

### Settings 页（用户设置页）

新增"Webhook 通知"区块，包含：

- **全局 Webhook URL**：text input，blur 保存
- **Bearer Token**：password input，可显示/隐藏，blur 保存；GET 时显示脱敏占位符
- **测试**按钮：向 `/api/console/webhooks/test` 发 POST，后端向当前配置的 URL 发送一条测试 payload，返回成功/失败

---

## 第 4 节：测试策略

### 后端单元 / 组件测试

| 文件 | 测试要点 |
|------|---------|
| `alert-notifier.test.ts` | webhook 分支：有 URL 时 fetch 被调用且带正确 header；无 URL 时不调用；非 2xx 时仅 warn 不抛出；10s 超时触发时不重试 |
| `alerts.test.ts` | POST/PATCH 含 `webhookUrl` 字段被正确持久化；空串清除覆盖 |
| `me.test.ts` | PATCH /me 更新 webhookUrl/webhookToken；GET 返回脱敏 token |

### 前端组件测试

| 文件 | 测试要点 |
|------|---------|
| `Alerts.test.jsx` | webhook 出现在 channel 下拉；选择后 URL 输入框出现；全局+per-alert URL 均空时 banner 出现；有任意一个 URL 时 banner 消失 |

### 功能测试

| 文件 | 测试要点 |
|------|---------|
| `e2e.test.ts` 或新增 `webhook.test.ts` | 创建 webhook 告警 → mock HTTP server 接收到正确 payload → Redis cooldown 被写入 |

---

## 超出范围

- Webhook 签名（HMAC-SHA256）——本次用 Bearer Token，签名可后续单独迭代
- 失败重试队列
- Webhook 投递历史 UI
- 多 endpoint 管理（命名 endpoint 表）
- webhook_token 加密存储（可后续迁移）
