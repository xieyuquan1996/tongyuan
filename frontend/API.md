# 同源 · API 文档

中转网关 REST API。前端通过 `src/lib/api.js` 的 `api(path, opts)` 统一调用；默认命中 `src/lib/mock.js` 的浏览器内 Mock 后端，真实后端按同样的路径和返回结构实现即可。

基础约定：

- Base URL：与前端同源；开发期通过 Vite 代理转发到 `VITE_API_TARGET`（默认 `http://localhost:8080`）。
- Content-Type：请求与响应均为 `application/json; charset=utf-8`。
- 鉴权：受保护接口需要 `Authorization: Bearer <token>`，`token` 来自登录返回的 `session.token`。
- 错误响应：非 2xx 统一返回 `{ "error": "<code>", "message"?: "<detail>" }`。前端遇到 `401` 会清 session 并跳 `/login`。
- 时间：所有时间字段均为 ISO-8601 字符串。
- 金额：除非特别说明，均为字符串形式的人民币金额（`"84.20"`）。

---

## 1. 公开接口（免鉴权）

### 1.1 GET /api/public/stats

首页 Hero 区的聚合指标。

响应 200：

```json
{
  "uptime_30d": "99.97%",
  "p50_latency": "187ms",
  "p99_latency": "412ms",
  "consistency": "100%",
  "region": "cn-east-1"
}
```

### 1.2 GET /api/public/regions

各区域实时状态。

响应 200：

```json
{
  "regions": [
    { "id": "cn-east-1", "name": "上海",  "status": "ok",   "latency": "187ms" },
    { "id": "hk-1",      "name": "香港",  "status": "ok",   "latency": "84ms"  },
    { "id": "us-west-2", "name": "美西",  "status": "warn", "latency": "1.2s"  }
  ]
}
```

`status` 枚举：`ok` · `warn` · `down`。

### 1.3 GET /api/public/models

模型列表。

响应 200：

```json
{
  "models": [
    { "id": "claude-opus-4.7",  "context": "200k", "price": "$15 / $75", "note": "最强能力", "recommended": true },
    { "id": "claude-sonnet-4.5","context": "200k", "price": "$3 / $15",  "note": "性价比之选" }
  ]
}
```

`price` 语义：`input / output per million tokens`（USD）。

### 1.4 GET /api/public/plans

定价套餐。

响应 200：

```json
{
  "plans": [
    { "name": "Starter", "price": "¥0",   "per": "起步赠送 1M tokens", "cta": "免费开始", "features": ["..."] },
    { "name": "Pro",     "price": "¥199", "per": "/ 月起 · 按量计费",   "cta": "升级到 Pro", "featured": true, "features": ["..."] }
  ]
}
```

### 1.5 GET /api/public/status

对外状态页聚合。

响应 200：

```json
{
  "overall": "ok",
  "components": [
    { "id": "gateway",   "name": "网关",         "status": "ok", "note": "各区域正常" },
    { "id": "anthropic", "name": "上游 · Anthropic", "status": "ok", "note": "" }
  ],
  "regions": [ /* 同 /api/public/regions */ ],
  "incidents": []
}
```

### 1.6 GET /api/public/changelog

更新日志。

响应 200：

```json
{
  "entries": [
    { "date": "2026-04-21", "tag": "feature", "title": "Opus 4.7 上线", "body": "..." }
  ]
}
```

`tag` 枚举：`feature` · `improvement` · `fix`。

---

## 2. 账号与会话

### 2.1 POST /api/console/register

请求：

```json
{ "email": "me@example.com", "password": "at-least-6-chars", "name": "Me" }
```

响应 201：

```json
{
  "user": { "id": "...", "email": "me@example.com", "plan": "Starter", "balance": "10.00", "...": "..." },
  "session": { "token": "<hex>", "user_id": "...", "created_at": "...", "expires_at": "..." }
}
```

错误码：`missing_fields` (400) · `invalid_email` (400) · `weak_password` (400) · `email_exists` (409)。

### 2.2 POST /api/console/login

请求：`{ "email": "...", "password": "..." }`

响应 200：同 register 的 `{ user, session }`。

错误码：`invalid_credentials` (401)。

登录成功后前端会把 `user` 存到 `localStorage["ty.user"]`，`session` 存到 `localStorage["ty.session"]`。

### 2.3 POST /api/console/logout

无请求体。响应 `{ "ok": true }`，服务端撤销 token。前端无论响应如何都会清本地 session。

### 2.4 POST /api/console/forgot

请求：`{ "email": "..." }`

响应 200：`{ "ok": true, "hint": "如果该邮箱已注册，我们已经发送了重置链接。" }`

为避免枚举已注册邮箱，始终返回成功。

### 2.5 GET /api/console/me

响应 200：去掉 `password` 的 `user` 对象。

### 2.6 PATCH /api/console/profile

可选字段：`name` · `company` · `phone` · `theme`（`light` / `dark`）· `notify_email` · `notify_browser`。只提交要改的字段即可。响应 200：更新后的 user。

### 2.7 POST /api/console/password

请求：`{ "current": "...", "next": "..." }`

响应 200：`{ "ok": true }`

错误码：`wrong_password` (401) · `weak_password` (400)。

---

## 3. 控制台（需鉴权）

### 3.1 GET /api/console/overview

Overview 页用的聚合数据。

响应 200：

```json
{
  "metrics": {
    "uptime_30d": "99.97",
    "p99_live_ms": 412,
    "requests_30d": "4.28M",
    "spent": "¥84.20",
    "projection": "¥168"
  },
  "latency_series": [412, 415, 396, "..."],
  "recent_requests": [ /* 同 /logs 的元素，最多 5 条 */ ]
}
```

### 3.2 GET /api/console/analytics

响应 200：

```json
{
  "daily": [
    { "date": "2026-03-28", "requests": 142030, "tokens": 120000000, "cost": "360.00", "latency_p50": 178, "latency_p99": 405 }
  ],
  "by_model":  [ { "model": "claude-opus-4.7",   "requests": 812300,  "tokens_m": 2430, "cost": "¥48.60", "share": 38 } ],
  "by_region": [ { "region": "cn-east-1",        "requests": 2140000, "share": 50, "p99": 412 } ],
  "errors":    [ { "kind": "rate_limit_429", "count": 412, "pct": "0.10%" } ]
}
```

### 3.3 API 密钥

#### GET /api/console/keys

```json
{
  "keys": [
    {
      "id": "...",
      "name": "production-app",
      "prefix": "sk-relay-9F3A",
      "created_at": "...",
      "last_used_at": "...",
      "state": "active"
    }
  ]
}
```

按 `created_at` 倒序返回。`state` 枚举：`active` · `revoked`。响应中**永远不含 `secret`**。

#### POST /api/console/keys

请求：`{ "name": "production-app" }`

响应 201：

```json
{
  "id": "...",
  "name": "production-app",
  "prefix": "sk-relay-ABCD",
  "secret": "sk-relay-ABCD....全长密钥",
  "created_at": "...",
  "last_used_at": null,
  "state": "active"
}
```

**`secret` 仅在创建时返回一次**。前端用 `SecretModal` 让用户复制，关闭后无法再拿到。

#### POST /api/console/keys/:id/revoke

无请求体。响应 200：撤销后的 key（不含 secret，`state = "revoked"`）。

错误码：`not_found` (404)。

### 3.4 请求日志

#### GET /api/console/logs

查询参数：`status` · `model` · `limit`（默认 50，最大 200）。

```json
{
  "logs": [
    {
      "id": "req_0a1b2c",
      "status": 200,
      "model": "claude-opus-4.7",
      "latency_ms": 421,
      "tokens": 2840,
      "cost": "0.0085",
      "region": "cn-east-1",
      "created_at": "...",
      "audit_match": true
    }
  ],
  "total": 50
}
```

#### GET /api/console/logs/:id

```json
{
  "log": { "...": "同列表元素" },
  "audit": {
    "upstream_endpoint": "https://api.anthropic.com/v1/messages",
    "model_hash": "sha256:a3f1...e8b2",
    "max_tokens": 4096,
    "system_len": 4201,
    "messages_len": 8940,
    "match": true
  }
}
```

`audit.match = true` 表示网关转发到上游的请求与客户端原始请求哈希一致，未被篡改。

### 3.5 账单

#### GET /api/console/billing

```json
{
  "billing": {
    "month_label": "2026 年 4 月",
    "used": "¥84.20",
    "limit": "¥200.00",
    "projection": "¥168",
    "next_reset": "2026-05-01",
    "balance": "¥115.80"
  },
  "plan": "Pro"
}
```

#### GET /api/console/invoices

```json
{ "invoices": [ { "id": "inv_2026_03", "period": "2026-03", "amount": "164.80", "status": "paid" } ] }
```

`status` 枚举：`paid` · `pending` · `void`。

#### GET /api/console/recharges

```json
{ "recharges": [ { "id": "rch_...", "amount": "200.00", "method": "alipay", "status": "succeeded", "created_at": "..." } ] }
```

#### POST /api/console/recharge

请求：`{ "amount": "200.00", "method": "alipay" }`（`method` 取值 `alipay` / `wechat`）

响应 201：`{ "recharge": { /* 同上 */ }, "balance": "315.80" }`

错误码：`invalid_amount` (400)，限制 `0 < amount ≤ 100000`。

### 3.6 告警

#### GET /api/console/alerts

```json
{
  "alerts": [
    { "id": "al_...", "kind": "balance_low", "threshold": "20", "channel": "email", "enabled": true }
  ]
}
```

`kind`：`balance_low` · `spend_daily` · `error_rate`。`channel`：`email` · `browser`。

#### POST /api/console/alerts

请求：`{ "kind": "balance_low", "threshold": "20", "channel": "email", "enabled": true }`，响应 201。

#### PATCH /api/console/alerts/:id

任选字段更新：`threshold` · `channel` · `enabled`。响应 200：更新后的告警。

#### DELETE /api/console/alerts/:id

响应 200：`{ "ok": true }`。

### 3.7 Playground

#### POST /api/console/playground

请求体兼容 Anthropic Messages API：

```json
{
  "model": "claude-sonnet-4.5",
  "max_tokens": 1024,
  "messages": [
    { "role": "user", "content": "你好" }
  ]
}
```

响应 200：

```json
{
  "id": "msg_...",
  "type": "message",
  "role": "assistant",
  "model": "claude-sonnet-4.5",
  "content": [{ "type": "text", "text": "..." }],
  "stop_reason": "end_turn",
  "usage": { "input_tokens": 42, "output_tokens": 128 },
  "audit_id": "aud_...",
  "latency_ms": 421
}
```

每次调用会同步写一条 `/api/console/logs` 记录，便于在日志页交叉验证。

---

## 4. 后台管理（需 `role=admin`）

所有 `/api/admin/*` 接口都要求登录会话对应的用户 `role === "admin"`，否则返回 `403 forbidden`。Mock 环境预置账号 `admin@tongyuan.ai / admin1234`。

所有写操作都会写入 `store.audit_log`，可通过 `GET /api/admin/audit` 查询。

### 4.1 GET /api/admin/overview

平台概览聚合：用户数 / 24h 请求 / 错误率 / 余额池 / 每日请求与错误序列 / 最近审计事件。

### 4.2 用户

- `GET /api/admin/users?q=&status=&plan=` — 列表（支持邮箱/姓名模糊、状态、套餐筛选）
- `GET /api/admin/users/:id` — 详情，返回 `{ user, keys, recent_logs, recharges, invoices }`
- `PATCH /api/admin/users/:id` — 可选字段 `plan` / `limit_this_month` / `role` / `status(active|suspended)`
- `POST /api/admin/users/:id/adjust` — `{ delta, note }`，带符号的余额调整；写审计 + 记录 `method=admin_adjust` 的充值

### 4.3 全部密钥

- `GET /api/admin/keys?user_id=&state=` — 跨租户，带 `owner_email` / `owner_name`
- `POST /api/admin/keys/:id/revoke` — `{ reason }`，写审计

### 4.4 全部请求

- `GET /api/admin/logs?status=&model=&user_id=&limit=` — 跨租户，每条带 `owner_email`
- `GET /api/admin/logs/:id` — 与控制台同结构 `audit` 对象

### 4.5 账单 / 收入

- `GET /api/admin/billing` — `{ totals, by_plan, by_user, invoices, recharges }`

### 4.6 模型 CRUD

- `GET /api/admin/models`
- `POST /api/admin/models` · `PATCH /api/admin/models/:id` · `DELETE /api/admin/models/:id`

### 4.7 区域 / 组件状态

- `GET /api/admin/regions` — `{ regions, components }`
- `PATCH /api/admin/regions/:id` — `{ status, latency, name }`
- `PATCH /api/admin/components/:id` — `{ status, note }`

### 4.8 公告

- `GET /api/admin/announcements`
- `POST /api/admin/announcements` — `{ title, body, severity(info|warn|err), pinned, visible }`
- `PATCH /api/admin/announcements/:id` · `DELETE /api/admin/announcements/:id`

### 4.9 审计

- `GET /api/admin/audit` — `{ events: [{ id, at, actor, action, target, note }] }`

---

## 5. 错误码总览

| code | HTTP | 含义 |
|---|---|---|
| `unauthorized`         | 401 | 缺失或无效 token |
| `invalid_credentials`  | 401 | 邮箱或密码错 |
| `wrong_password`       | 401 | 改密码时旧密码错 |
| `missing_fields`       | 400 | 必填字段缺失 |
| `invalid_email`        | 400 | 邮箱格式错误 |
| `weak_password`        | 400 | 密码少于 6 位 |
| `invalid_amount`       | 400 | 充值金额越界 |
| `email_exists`         | 409 | 注册邮箱已存在 |
| `account_suspended`    | 403 | 账户已被管理员冻结 |
| `forbidden`            | 403 | 非管理员访问 `/api/admin/*` |
| `model_exists`         | 409 | 模型 ID 已占用 |
| `not_found`            | 404 | 资源不存在或不属于当前用户 |
| `route_not_found`      | 404 | 路径未命中任何路由 |
| `mock_error`           | 500 | Mock 后端内部异常（仅 mock 会出现） |

---

## 6. 真实后端对接清单

- 登录返回结构必须是 `{ user, session: { token, expires_at, ... } }`，否则前端 `session.save()` 无法存储。
- `POST /api/console/keys` 的响应**必须**包含 `secret`，之后任何接口**不得**再返回该字段。
- `/api/console/logs/:id` 的 `audit.match` 用于前端徽章（绿色 = 一致），后端需真实比对上游转发内容的哈希。
- 所有 `user_id` 过滤由后端处理：一个用户只应看到自己的 keys / logs / invoices / recharges / alerts。
- CORS：生产期前后端同源时无需配置；开发期由 Vite 代理处理，后端不用开 CORS。
- 限流与鉴权失败返回 `401`，前端会自动登出。
