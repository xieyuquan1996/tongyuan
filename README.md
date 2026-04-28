# 同源 · Tongyuan

Claude API 中转网关。链接稳定，模型保真，绝不掺水。

## 特性

- **不掺水** — 请求哈希全量审计，你指定什么模型，到上游就是什么模型
- **高可用** — 多 Anthropic API Key 池，单 Key 失败自动切换，冷却后自动恢复
- **SDK 兼容** — 只需改 `ANTHROPIC_BASE_URL`，无需改代码
- **全量流式** — SSE 逐帧透传，usage 实时计量
- **控制台** — 注册/登录、API 密钥管理、请求日志、账单、Playground、告警
- **管理后台** — 上游 Key 池、模型管理、用户管理、公告、审计日志

## 快速开始

### 用户侧（Claude Code）

```bash
# Linux / macOS
bash <(curl -fsSL https://your-domain/api/install)

# Windows PowerShell
iex (iwr https://your-domain/api/install.ps1).Content
```

脚本会自动安装 Claude Code、写入 `ANTHROPIC_BASE_URL`，并引导你输入 API 密钥。

### 手动配置

```bash
export ANTHROPIC_BASE_URL=https://your-domain
export ANTHROPIC_API_KEY=sk-relay-xxxxxxxx   # 从控制台 → API 密钥 获取
claude
```

## 部署

### 前置条件

- Docker 24+ with Compose v2
- 2 GB+ RAM 的服务器
- 准备好 Anthropic 官方 API Key

### 启动

```bash
git clone <repo>
cd deploy
cp .env.example .env
# 填写必填项（见下方说明）
docker compose up -d --build
```

`.env` 必填项：

| 变量 | 说明 | 生成方式 |
|------|------|----------|
| `SESSION_SECRET` | 会话签名密钥 | `openssl rand -hex 32` |
| `UPSTREAM_KEY_KMS` | 上游 Key 加密主密钥 | `openssl rand -hex 32` |
| `METRICS_TOKEN` | `/metrics` 访问令牌 | `openssl rand -hex 16` |

### 初始化管理员

注册账号后，执行：

```bash
docker compose exec postgres psql -U postgres -d claude_link \
  -c "UPDATE users SET role='admin' WHERE email='YOUR_EMAIL'"
```

然后登录控制台，进入 **后台管理 → 上游密钥** 添加 Anthropic API Key。

### 添加多个 Anthropic API Key

在 **后台管理 → 上游密钥** 页面可以添加多个 Key：

- 每个 Key 可设置优先级（数字越小越优先）
- 网关按优先级顺序尝试，失败后自动切换到下一个
- Key 触发 429/5xx 后进入冷却期，冷却结束自动恢复
- 可随时在后台禁用/启用单个 Key，不影响其他 Key

## 架构

```
用户 (Claude Code / SDK)
  │  ANTHROPIC_BASE_URL=https://your-domain
  ▼
nginx (TLS 终止 + 静态前端)
  │  /api/* /v1/*
  ▼
backend (Hono + Node.js)
  ├── /v1/messages  ← 鉴权 → 限流 → 审计哈希 → 上游调度 → SSE 透传 → 计费
  ├── /api/console  ← 控制台 API
  └── /api/admin    ← 管理后台 API（需 admin 角色）
  │
  ├── PostgreSQL 16  (用户/密钥/日志/账单/模型)
  └── Redis 7        (限流/幂等/上游 Key 健康状态)
```

## 常用运维

```bash
# 查看日志
docker compose logs -f backend

# 重启应用
docker compose restart backend

# 备份数据库
docker compose exec postgres pg_dump -U postgres claude_link > backup.sql

# 更新版本
git pull && docker compose up -d --build
```

## 安全注意事项

- **`UPSTREAM_KEY_KMS` 不可随意更换** — 所有上游 Key 用此密钥加密存储，更换后需重新录入所有 Key
- **建议在 nginx 前加 TLS** — 本 compose 监听明文 HTTP，生产环境请用 Caddy / Traefik / 云 LB 做 TLS 终止
- **`/metrics` 建议加 IP 白名单** — 已有 token 保护，可在 `frontend/nginx.conf` 追加 IP 限制
