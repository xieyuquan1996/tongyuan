# Claude 中转网关 MVP 设计文档

**日期**：2026-04-27
**范围**：MVP（网关核心 + 最小控制台）
**状态**：已确认设计，待实施

---

## 1. 产品定位

一个 Anthropic Claude API 中转网关。三条承诺，按重要性排序：

1. **稳定**：单个上游账号被封不会让用户侧链接不可用。
2. **不掺水**：用户指定的 `model` 就是实际发到 Anthropic 的 `model`；请求载荷只改鉴权头，其他语义字段一字不改。用户可验证。
3. **SDK 无缝兼容**：用户改一个 `ANTHROPIC_BASE_URL` 就能把 Claude Code / 官方 SDK / LangChain 切过来，不需要改代码。

非目标（MVP 明确不做）：
- 支付 / 充值闭环（预留接口，返回 501）
- 告警的邮件/浏览器推送（CRUD 保留，不触发）
- 管理后台（除了上游 Key 池 + 模型元数据外）
- 多租户团队 / 子账号 / SSO
- 发票 PDF 生成

---

## 2. 范围（MVP B）

### 2.1 用户面（SDK 入口，Anthropic 兼容）
- `POST /v1/messages`（流式 + 非流式）
- `POST /v1/messages/count_tokens`
- `GET /v1/models`

### 2.2 控制台（前端 dashboard 脱离 mock）
- 注册 / 登录 / 登出 / me / profile / 改密
- Overview：聚合指标 + 延迟序列 + 最近请求
- API Keys：创建 / 列表 / 撤销（`secret` 仅返回一次）
- Logs：列表筛选 + 详情（含审计哈希）
- Playground：走内部 `/api/console/playground`，复用 `/v1/messages` 管道
- Billing：只读展示余额 / 本月用量 / 投影（充值按钮触发 501）

### 2.3 最小管理后台
- 上游 Key 池 CRUD + 状态监控
- 模型元数据（同步 + 启用开关 + 价格加成）
- 汇率设置

### 2.4 明确不在 MVP 内
- 告警触发逻辑（只存配置）
- 充值支付对接
- 区域 / 组件状态的真实探测（`/api/public/status` 返回静态配置）
- 公告 CRUD
- 平台审计日志查询
- 账号池兜底的真实实现（预留调度层接口和配置）

---

## 3. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 运行时 | Node.js 20 LTS | 与前端同构 |
| HTTP 框架 | Hono | SSE 透传原生支持，中间件生态轻，类型友好 |
| 语言 | TypeScript | 类型定义可与前端共享（`shared/types`） |
| 主数据库 | PostgreSQL 16 | 事务扣费、日志归档 |
| ORM | Drizzle ORM | 轻、SQL 贴近、迁移简单 |
| 缓存 / 热状态 | Redis 7 | 上游 Key 健康状态、限流计数、幂等缓存 |
| Anthropic 客户端 | `@anthropic-ai/sdk` | 官方维护，跟新模型最快 |
| 进程管理 | pm2 或直接 Docker | 多副本横向扩展 |
| 部署 | Docker Compose（本地 / 单机）| MVP 不上 k8s |

---

## 4. 架构

```
┌─────────────────────────────────────────────────────────────┐
│                          用户                                │
│   Claude Code / Anthropic SDK / LangChain / 浏览器前端       │
└───────────────┬──────────────────────────────────┬──────────┘
                │ ANTHROPIC_BASE_URL               │ /api/console/*
                │ x-api-key: sk-relay-*            │ Bearer <session-token>
                ▼                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    Hono App（Node.js）                       │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐   │
│  │ /v1/*       │  │ /api/public │  │ /api/console/*    │   │
│  │ SDK 兼容层  │  │ 公开指标    │  │ session + CRUD    │   │
│  └──────┬──────┘  └─────────────┘  └────────┬──────────┘   │
│         │                                    │              │
│         ▼                                    ▼              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              中间件：鉴权 / 限流 / 幂等              │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                         ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │   GatewayCore：调度 → 转发 → 审计 → 计量 → 扣费      │  │
│  │                                                        │  │
│  │   [UpstreamScheduler]  [SSEProxy]  [AuditHasher]     │  │
│  │   [UsageMeter]         [Biller]    [LogWriter]       │  │
│  └──────┬───────────────────────────────────────────────┘  │
└─────────┼───────────────────────────────────────────────────┘
          │ 官方 Key（轮询）│ 账号池（预留接口）
          ▼
┌─────────────────┐          ┌─────────────────┐
│ api.anthropic   │          │  Postgres + Redis│
│      .com       │          │  users / keys    │
└─────────────────┘          │  logs / upstream │
                             │  billing_ledger  │
                             └─────────────────┘
```

---

## 5. 数据模型

Drizzle schema 主表。字段用蛇形命名，代码层转驼峰。

### 5.1 `users`
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| email | text unique | |
| password_hash | text | bcrypt cost=12 |
| name | text | |
| role | text | `user` \| `admin` |
| status | text | `active` \| `suspended` |
| plan | text | `Starter` \| `Pro` |
| balance_usd | numeric(12,6) | 内部以 USD 记账 |
| limit_monthly_usd | numeric(12,6) | null = 无限 |
| theme / company / phone / notify_* | … | 来自 API.md |
| created_at / updated_at | timestamptz | |

注册赠送 `balance_usd = 10.000000`。前端显示的 `¥` 金额由后端按当前汇率折算并格式化。

### 5.2 `sessions`
| id | uuid pk |
| user_id | uuid fk |
| token_hash | text unique | 存 SHA-256，不存明文 |
| expires_at | timestamptz |
| created_at | timestamptz |

Bearer token = `base64url(random(32))`。前端存明文，DB 存 hash。

### 5.3 `api_keys`（用户的 sk-relay-*）
| id | uuid pk |
| user_id | uuid fk |
| name | text |
| prefix | text | 前 12 字符，列表可见 |
| secret_hash | text | bcrypt 整串 |
| state | text | `active` \| `revoked` |
| rpm_limit / tpm_limit | int | null = 用账户默认 |
| created_at / last_used_at / revoked_at | timestamptz |

格式：`sk-relay-` + 40 字符 base62。仅 `POST /keys` 响应返回明文，此后永不返回。

### 5.4 `upstream_keys`（上游官方 Key 池）
| id | uuid pk |
| alias | text | 管理员给的标签 |
| provider | text | MVP 固定 `anthropic_official`；预留 `anthropic_oauth`（账号池） |
| key_ciphertext | bytea | AES-256-GCM 加密，KMS 主密钥从环境变量取 |
| key_prefix | text | `sk-ant-api03-ABCD`，列表可见 |
| state | text | `active` \| `cooldown` \| `disabled` |
| priority | int | 数字小优先 |
| cooldown_until | timestamptz | |
| last_error_code / last_error_at | | |
| quota_hint_usd | numeric | 管理员填的额度提示，仅展示用 |
| created_at | timestamptz | |

Redis 镜像 `upstream:health:<id>` 用于高频读；DB 为真源。

### 5.5 `models`（本地模型元数据）
| id | text pk | `claude-opus-4-7` 等 |
| display_name | text |
| context_window | int |
| input_price_usd_per_mtok | numeric |
| output_price_usd_per_mtok | numeric |
| cache_write_price_usd_per_mtok | numeric | null = 不支持 |
| cache_read_price_usd_per_mtok | numeric | |
| markup_pct | numeric | 默认 0；对用户扣费时用 `price * (1 + markup)` |
| enabled | bool |
| recommended | bool |
| note | text |
| synced_at | timestamptz | |

管理员通过 `POST /api/admin/models/sync` 拉 `GET /v1/models` 同步，本地只能改 `display_name / markup_pct / enabled / recommended / note`，不能凭空新建不存在的上游模型。

### 5.6 `request_logs`
| id | text pk | `req_` + ulid |
| user_id | uuid fk |
| api_key_id | uuid fk |
| upstream_key_id | uuid fk | 实际用到的上游 |
| model | text | 用户请求的 model |
| upstream_model | text | 实际转发的 model（和 `model` 必须相等，否则标记异常） |
| endpoint | text | `/v1/messages` 等 |
| stream | bool |
| status | int | HTTP status |
| error_code | text | null 或 `rate_limit_429` / `upstream_error` / … |
| latency_ms | int |
| ttfb_ms | int | 首字节延迟（流式诊断用） |
| input_tokens / output_tokens | int |
| cache_read_tokens / cache_write_tokens | int |
| cost_usd | numeric(12,6) |
| request_hash | text | 见 §7 |
| upstream_request_hash | text | 实际发给上游的再哈希 |
| audit_match | bool | 两个 hash 是否一致 |
| idempotency_key | text | null 或用户传的 |
| created_at | timestamptz |

热表保留 30 天，后续归档至冷存储（MVP 不做归档，留迁移空间）。

### 5.7 `billing_ledger`（扣费流水）
| id | uuid pk |
| user_id | uuid fk |
| request_log_id | text fk | 每次 API 调用一条借记 |
| kind | text | `debit_usage` \| `credit_signup` \| `credit_admin_adjust` |
| amount_usd | numeric(12,6) | 借记为负，贷记为正 |
| balance_after_usd | numeric(12,6) |
| note | text |
| created_at | timestamptz |

`users.balance_usd` 是 ledger 的物化和。每次写 ledger 用事务更新 users.balance。

### 5.8 `alerts`
字段照 API.md §3.6，MVP 只存不触发。

### 5.9 `settings`（全局单行 KV 表）
- `usd_cny_rate`：默认 `7.20`，admin 可改
- `default_rpm_per_key` / `default_tpm_per_key`：默认 `60 / 1000000`
- `upstream_cooldown_ms_429` / `upstream_cooldown_ms_5xx`：默认 `60000 / 300000`

### 5.10 `audit_events`（管理操作审计）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid pk | |
| at | timestamptz | |
| actor_user_id | uuid fk | admin 用户 |
| action | text | `upstream_key.create` / `model.patch` / `settings.update` 等 |
| target_type / target_id | text | |
| diff_json | jsonb | 变更前后的字段对比 |
| ip | inet | |

---

## 6. 核心流程

### 6.1 SDK 请求：`POST /v1/messages`

```
客户端
  │  Header: x-api-key: sk-relay-ABCD...  或  Authorization: Bearer sk-relay-...
  │  Body:   { model, messages, max_tokens, stream?, system?, tools?, ... }
  ▼
[1] auth middleware
    - 解析 sk-relay-*（两种 header 都接受）
    - bcrypt 对比 prefix 命中的 api_keys.secret_hash
    - 查 user.status = active，user.balance_usd > 0
    - 不通过 → 401/403/402
    ▼
[2] idempotency middleware
    - 读 Idempotency-Key
    - Redis GET idem:<user_id>:<key> → 命中则直接回放上次响应
    - 未命中则 SETNX 占位（TTL 24h）
    ▼
[3] rate limit middleware
    - Redis 令牌桶：api_key:rpm / api_key:tpm
    - 超限 → 429 rate_limit
    ▼
[4] model gate
    - 查 models 表：enabled + 存在
    - 否则 → 400 unknown_model
    ▼
[5] audit: 计算 request_hash
    - canonicalize({ model, messages, system, max_tokens, tools,
                     temperature, top_p, top_k, stop_sequences,
                     stream, metadata })
    - SHA-256
    ▼
[6] UpstreamScheduler.pick()
    - SELECT upstream_keys WHERE state='active' ORDER BY priority, last_used_at
    - 返回一个候选 key；记下 upstream_key_id
    ▼
[7] 转发到 api.anthropic.com
    - 移除所有 sk-relay-* / Authorization
    - 插入上游 key：x-api-key: <decrypted>
    - 同步计算 upstream_request_hash = sha256(canonicalize(转发 body))
    - audit_match = (request_hash === upstream_request_hash)
    ▼
[8a] 非流式
     - 等上游响应
     - 解析 usage → 按模型价格 + markup 算 cost_usd
     - 事务：写 request_logs + 写 billing_ledger + 扣 users.balance_usd
     - 响应体**原样透传**（含上游生成的 `id`、`model`、`usage`，不改写任何字段）
[8b] 流式（stream: true）
     - Hono streamSSE 透传上游每一帧
     - 挂钩：从 message_start.message.usage.input_tokens 取输入用量
             从 message_delta.usage.output_tokens 累加输出用量
             从 message_stop 触发最终计费
     - 流结束后异步写 logs + ledger + 扣费（同事务）
     - 如果客户端断开：记录部分用量，按已消耗扣费
    ▼
[9] 失败处理（任何一步上游返回 429 / 5xx / 网络错误）
    - 把本 upstream_key 打入 cooldown
      (cooldown_until = now + cooldown_ms; state = 'cooldown')
    - 如果还有其他 active key：回到 [6] 换一把重试（最多 3 次）
    - 全部冷却：
       * 如果配置了 account_pool 且有可用 → 降级（MVP：占位，直接返回 503）
       * 否则 → 502 all_upstreams_down
    - 重试期间不重复扣费，只有成功那一次计费
```

### 6.2 流式审计哈希

**问题**：用户要能证明"我发什么，上游就收什么"。流式下响应没法完整 hash，但**请求**方向可以。

**方案**：只哈希请求方向。`request_hash` 与 `upstream_request_hash` 在同一进程同步算出来对比。`audit_match` 为 true 的含义是：**网关没有篡改 model / messages / system / tools / 采样参数，只替换了鉴权头**。

Canonicalize 规则：
- 键字典序排序
- 丢弃 null / undefined 字段
- 数字保留原始精度（不做科学记数法转换）
- 字符串 NFC 归一化
- JSON.stringify 无空格
- `metadata.user_id` 保留（用户标识本身是语义载荷）

### 6.3 扣费算法

```
cost_usd =
    input_tokens     * model.input_price_usd_per_mtok  / 1_000_000 +
    output_tokens    * model.output_price_usd_per_mtok / 1_000_000 +
    cache_read       * model.cache_read_price          / 1_000_000 +
    cache_write      * model.cache_write_price         / 1_000_000
charge_usd = cost_usd * (1 + model.markup_pct)
```

余额不足的判断：请求进入时 `balance > 0` 就放行（因为流式无法预判用量）。流式跑到一半余额变负也继续跑完，最多欠一次。欠费账户下一次请求返回 `402 insufficient_balance`。

---

## 7. API 契约修正（对 API.md 的偏离）

本节列出本设计对 `frontend/API.md` 的必须修正。前端代码改动最小化；能由后端返回派生字段兼容现有 UI 的就兼容。

### 7.1 新增（API.md 没有，产品必需）

- **`POST /v1/messages`** — SDK 入口，流式 + 非流式，Anthropic 契约透传
- **`POST /v1/messages/count_tokens`** — 透传
- **`GET /v1/models`** — 从本地 `models` 表返回 `enabled=true` 的模型，格式对齐 Anthropic
- **`POST /api/admin/upstream-keys`** / `GET` / `PATCH` / `DELETE` — 上游 Key 池
- **`POST /api/admin/models/sync`** — 从 Anthropic 拉最新模型清单

### 7.2 修正

- **鉴权 header 双接受**：SDK 用 `x-api-key`，控制台用 `Authorization: Bearer`。`/v1/*` 两个都吃；`/api/console/*` 只认 Bearer。
- **`audit.match` 语义重定义**：从"字节级 hash 一致"改为"语义载荷 canonicalize 后哈希一致"。前端徽章含义不变（绿色 = 没掺水），用户可在详情抽屉看到两个 hash 值做自验证。
- **`/api/admin/models` 改为受限 CRUD**：
  - `POST` 返回 `405 method_not_allowed`，引导用 `sync`
  - `PATCH` 允许的字段：`display_name / markup_pct / enabled / recommended / note`
  - `DELETE` 只能删除 `enabled=false` 且无关联日志的本地条目
- **货币一致性**：DB 内部全用 USD（numeric(12,6)）。API 响应里 `balance / used / limit / cost` 三种字段分别用 `_usd` / `_cny` 双字段返回，前端自选。保留 API.md 里的 `"¥84.20"` 字符串字段作为向后兼容派生（由 `_cny` 格式化）。
- **`/api/public/models` 的 `price` 字段**：保留字符串 `"$15 / $75"` 给前端直接渲染，同时新增 `input_price_usd_per_mtok` / `output_price_usd_per_mtok` 数字字段。
- **`/api/console/recharge`**：MVP 返回 `501 not_implemented`，响应体 `{ "error": "not_implemented", "message": "充值功能即将上线" }`。前端按钮不隐藏，提交后弹错误提示。
- **`/api/public/status`**：MVP 读 `config/status.json` 静态文件返回。不做真实探测。文件结构同 API.md 响应，可由 admin 直接编辑文件 + 重启生效（MVP 简化，后续挪进 DB）。
- **错误码补充**：
  - `insufficient_balance` (402) — 余额为负
  - `rate_limit` (429) — 用户侧限流
  - `all_upstreams_down` (502) — 所有上游 Key 冷却
  - `not_implemented` (501) — 占位接口
  - `unknown_model` (400)

### 7.3 保留但不落地（返回占位数据或 501）

- `/api/console/alerts` CRUD：落 DB，但不触发任何通知
- `/api/console/invoices` / `/api/console/recharges`：只读空数组 or 历史静态数据
- `/api/admin/*`（除 upstream-keys / models 外）：返回 `501`
- `/api/public/changelog`：读 `changelog.json` 静态文件

---

## 8. 模块划分（代码结构）

```
backend/
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── docker-compose.yml           # postgres + redis + app
├── Dockerfile
├── src/
│   ├── index.ts                 # Hono app 入口
│   ├── env.ts                   # 环境变量 schema 校验（zod）
│   ├── db/
│   │   ├── schema.ts            # Drizzle schema
│   │   ├── client.ts
│   │   └── migrations/          # drizzle-kit 生成
│   ├── redis/
│   │   └── client.ts
│   ├── crypto/
│   │   ├── password.ts          # bcrypt wrapper
│   │   ├── tokens.ts            # sk-relay-* / session token 生成
│   │   ├── kms.ts               # 上游 key 加密 / 解密
│   │   └── hash.ts              # canonicalize + sha256
│   ├── middleware/
│   │   ├── auth-bearer.ts
│   │   ├── auth-api-key.ts
│   │   ├── rate-limit.ts
│   │   ├── idempotency.ts
│   │   └── error.ts
│   ├── gateway/
│   │   ├── scheduler.ts         # UpstreamScheduler
│   │   ├── proxy.ts             # 请求转发（流 + 非流）
│   │   ├── sse.ts               # SSE 帧解析 + 用量抽取
│   │   ├── audit.ts             # hash 计算 + 对比
│   │   ├── meter.ts             # token → cost
│   │   └── biller.ts            # 扣费事务
│   ├── routes/
│   │   ├── v1/
│   │   │   ├── messages.ts
│   │   │   ├── count-tokens.ts
│   │   │   └── models.ts
│   │   ├── public/
│   │   │   ├── stats.ts
│   │   │   ├── models.ts
│   │   │   ├── plans.ts
│   │   │   ├── regions.ts
│   │   │   ├── status.ts
│   │   │   └── changelog.ts
│   │   ├── console/
│   │   │   ├── auth.ts          # register / login / logout / me / profile / password / forgot
│   │   │   ├── overview.ts
│   │   │   ├── keys.ts
│   │   │   ├── logs.ts
│   │   │   ├── billing.ts
│   │   │   ├── playground.ts
│   │   │   └── alerts.ts
│   │   └── admin/
│   │       ├── upstream-keys.ts
│   │       └── models.ts
│   ├── services/
│   │   ├── users.ts
│   │   ├── sessions.ts
│   │   ├── api-keys.ts
│   │   ├── upstream-keys.ts
│   │   ├── models.ts
│   │   └── logs.ts
│   └── shared/
│       ├── errors.ts            # AppError + code → status 映射
│       ├── types.ts             # 与前端共享的类型（后续 publish 到 shared/ 包）
│       └── format.ts            # USD ↔ CNY 格式化
└── tests/
    ├── unit/                    # 纯函数：hash / meter / scheduler
    ├── integration/             # 接口 + DB（testcontainers）
    └── e2e/                     # 全链路：SDK → 网关 → mock 上游
```

前端改动极小：删 `src/lib/mock.js`，`api.js` 直连。开发时 `VITE_API_TARGET=http://localhost:8080`。

---

## 9. 可观测性

- **结构化日志**：pino，每条请求一行 JSON，含 `req_id / user_id / api_key_id / upstream_key_id / model / status / latency_ms / audit_match`
- **Prometheus 指标**（`/metrics` 端点，仅允许 `role=admin` 的 session 或环境变量配置的 `METRICS_TOKEN` 访问）：
  - `gateway_requests_total{model, status}`
  - `gateway_latency_ms_bucket{model, phase=ttfb|total}`
  - `upstream_state{upstream_key_id, state}` (gauge)
  - `upstream_errors_total{upstream_key_id, code}`
  - `billing_usd_consumed_total{model}`
- **审计日志**（DB `audit_events` 表，见 §5.10）：admin 的写操作全部入库
- MVP 不接 Sentry / OpenTelemetry，但日志格式兼容后续接入

---

## 10. 安全

- 密码：bcrypt cost=12
- Session token / API key secret：明文只在创建响应里透给前端一次（session token 前端存 localStorage，API key secret 前端存 SecretModal 等用户复制），DB 只存 SHA-256（session）或 bcrypt hash（API key）
- 上游 Key：AES-256-GCM 加密存储，主密钥 `UPSTREAM_KEY_KMS` 从环境变量读（不入库）
- 日志脱敏：`messages` 内容**不入库**（只记 token 数和 hash）；详情抽屉的 `system_len / messages_len` 是字节数，不是内容
- 限流：api_key 维度 + user 维度 + ip 维度三级
- CORS：同源部署，无需配置；开发期 vite 代理处理
- Admin 接口：`role=admin` 的 session 即可访问；改 upstream key 这类敏感操作要求请求里带 `X-Admin-Confirm: <当前 session 的重新登录口令哈希前 8 位>`，防止 session 劫持后直接改 key
- 审计表 `audit_events`（见 §5.10）：admin 的所有写操作自动落盘

---

## 11. 部署形态

```yaml
# docker-compose.yml（MVP）
services:
  postgres:
    image: postgres:16-alpine
    volumes: [./data/pg:/var/lib/postgresql/data]
  redis:
    image: redis:7-alpine
  app:
    build: .
    environment:
      DATABASE_URL: postgres://...
      REDIS_URL: redis://redis:6379
      UPSTREAM_KEY_KMS: ${UPSTREAM_KEY_KMS}
      SESSION_SECRET: ${SESSION_SECRET}
    ports: ["8080:8080"]
  frontend:
    build: ../frontend
    # 生产构建产物，nginx 静态 serve + 反代 /api
```

Node app 可多副本：Redis 共享状态，Postgres 是唯一真源。前端 `dist/` 同源部署。

---

## 12. 测试策略

- **单元**：canonicalize + hash、meter（token → cost）、scheduler（pick + cooldown）
- **集成**：testcontainers 起 pg + redis，跑接口级用例，覆盖：
  - 注册→登录→建 key→调 `/v1/messages` 全链路
  - 上游第一把 key 返回 429，自动切第二把
  - 所有上游冷却 → 返回 502
  - 流式中断 → 已消耗 token 正确计费
  - 幂等：同 Idempotency-Key 重放返回同结果，不二次扣费
- **契约**：用 `@anthropic-ai/sdk` 指到本地网关跑几条官方 example，验证 SDK 兼容
- **前端 e2e**：保留一条，验证 dashboard 脱离 mock 后关键流仍工作

---

## 13. 里程碑（粗颗粒，实施计划里细化）

1. 骨架：Hono + DB + Redis + env + Docker Compose 能起
2. 鉴权：注册 / 登录 / session / api_key CRUD
3. 上游池：admin 接口 + 加密存储 + scheduler 基础
4. 网关非流式：`/v1/messages` 打通 + 审计 + 扣费
5. 网关流式：SSE 透传 + 流式计费
6. Logs / Overview / Billing 只读接口
7. Playground 通过内部调用 `/v1/messages`
8. 观测指标 + 限流 + 幂等
9. 公开接口（/public/*）静态配置化
10. 集成测试 + 部署脚本

---

## 14. Open Questions

这几个问题不阻塞 MVP 实施，但需要在里程碑对应节点前确认：

1. **上游 Key 的额度监控**：Anthropic 有没有接口能查单 key 的已用额度？如果没有，只能用"429/403 次数"反推。MVP 先只看错误码。
2. **汇率更新频率**：手动 admin 改还是拉外部汇率 API？MVP 手动。
3. **日志保留策略**：30 天后归档到哪？MVP 只保留 30 天窗口，超期由 cron 硬删。
4. **`cache_control` 定价**：Anthropic 的 prompt cache 分 5m / 1h，价格不同。MVP 只支持 5m，1h cache 按同价记（小偏差，后续细化）。
5. **账号池具体协议**：B 范围预留接口，实际实现放到下一期。接口层约定 `provider='anthropic_oauth'` 的 upstream_keys 由独立 adapter 处理。
