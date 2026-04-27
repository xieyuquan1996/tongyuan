# claude-link · Backend

Node.js + Hono 实现的 Claude 中转网关。提供完整的鉴权、上游 Key 池、`/v1/messages` 透传（流 / 非流）、审计哈希、计费、控制台查询与 Playground、Redis 限流与幂等、公开站点数据、可观测端点。

## 本地开发

```bash
cp .env.example .env
# 把 SESSION_SECRET / UPSTREAM_KEY_KMS 换成随机值：
# openssl rand -hex 32  （SESSION_SECRET）
# openssl rand -hex 32  （UPSTREAM_KEY_KMS）
docker compose up -d postgres redis
npm install
npm run db:migrate
npm run dev
```

## 主要端点

- `POST /api/console/register` / `/login` / `/logout` / `/me` / `/profile` / `/password`
- `GET /api/console/keys` · `POST /api/console/keys` · `POST /api/console/keys/:id/revoke`
- `GET /api/console/overview` · `/logs` · `/logs/:id` · `/billing/summary` · `/billing/usage`
- `POST /api/console/playground`（非流）· `/playground/stream`（SSE）
- `GET/POST/PATCH/DELETE /api/admin/upstream-keys`（需 admin）
- `POST /api/admin/models/sync` · `PATCH /api/admin/models/:id`
- `GET /api/public/stats` · `/regions` · `/plans` · `/status` · `/changelog`
- `GET /v1/models` · `POST /v1/messages`（流 / 非流）· `POST /v1/messages/count_tokens`
- `GET /healthz` · `GET /metrics`（`METRICS_TOKEN` 保护）

## 跑测试

```bash
npm test
```

## 验收清单

Part 1：
- [x] 注册 / 登录 / session
- [x] API key 创建 / 列表 / 撤销（secret 只返回一次）
- [x] 上游 Key 池加解密存储 + 优先级调度 + 冷却
- [x] `/v1/messages` 非流式：审计哈希 + 扣费 + 失败切换
- [x] `/v1/messages` 流式：SSE 透传 + 增量 usage + 流结束计费
- [x] `/v1/models` · `/v1/messages/count_tokens`

Part 2：
- [x] Console 查询：Overview / Logs / Billing
- [x] Playground（非流 + SSE）
- [x] Redis 限流 + 幂等中间件
- [x] `/api/public/*` 从 `config/public.json` 静态化
- [x] Prometheus `/metrics`（token-gated）+ 网关指标
- [x] e2e 自包含 mock upstream 覆盖主路径
- [x] 部署工件：`backend/Dockerfile`、`frontend/Dockerfile + nginx`、`deploy/docker-compose.yml`

## 部署

单机 Docker Compose 全栈（postgres + redis + backend + nginx 前端）见 [`../deploy/README.md`](../deploy/README.md)。
