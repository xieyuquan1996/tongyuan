# 同源 · Frontend

Vite + React + React Router SPA。包含首页、登录、市场站、控制台、开发者文档五个表面，全部通过 `/api/*` 调用后端。

## 快速开始

```bash
cd frontend
npm install
npm run dev      # 开发服务器 http://localhost:5173
npm run build    # 生产构建 → dist/
npm run preview  # 本地预览生产构建
```

登录 demo 账号：`demo@tongyuan.ai` / `demo1234`（登录页已预填）。

## 路由

| 路径 | 页面 |
|---|---|
| `/` | 前端主入口，跳到三个产品表面 |
| `/login` | 登录页（未登录访问 `/dashboard/*` 时会自动重定向到这里） |
| `/marketing` | 公开落地页 |
| `/dashboard/overview` | 控制台 · 概览（metric cards + 延迟曲线 + 最近请求） |
| `/dashboard/keys` | API 密钥 · 创建 / 列表 / 撤销 · 新密钥弹窗仅显示一次 |
| `/dashboard/logs` | 请求日志 · 筛选 · 点击行打开审计抽屉 |
| `/dashboard/billing` | 账单 · 用量 / 发票 |
| `/admin/*` | 后台管理（仅 `role=admin`）· 平台概览 / 用户 / 全部密钥 / 全部请求 / 账单收入 / 模型 / 区域 / 公告 / 审计 |
| `/docs/quickstart` · `/docs/messages` · `/docs/audit` | 开发者文档 |

## API 接口

前端所有数据请求都走 `api(path, opts)`（在 `src/lib/api.js`），自动带上 session token。

**公开：**
- `GET /api/public/stats` — 首页 / Hero 区域的 uptime / 延迟指标
- `GET /api/public/regions` — 各区域实时状态
- `GET /api/public/models` — 模型列表
- `GET /api/public/plans` — 定价套餐

**会话：**
- `POST /api/console/login` → `{email, password}` · 返回 `{user, session}`
- `POST /api/console/logout`
- `GET /api/console/me`

**控制台（需要 Authorization: Bearer <token>）：**
- `GET /api/console/overview`
- `GET /api/console/keys` · `POST /api/console/keys` · `POST /api/console/keys/:id/revoke`
- `GET /api/console/logs?status=&model=&limit=` · `GET /api/console/logs/:id`
- `GET /api/console/billing` · `GET /api/console/invoices`

## 和后端对接

### 方式一：Mock 后端（默认）

`src/lib/mock.js` 在浏览器里拦截 `fetch("/api/*")` 并从 `localStorage` 里返回真实数据。零依赖、离线可用，前端开发和 demo 都用这个。

想重置数据：

```js
localStorage.clear();  // 或只删 "ty.mock.store.v1" / "ty.session" / "ty.user"
```

### 方式二：真实后端

在 `frontend/` 下创建 `.env.local`：

```
VITE_USE_MOCK=false
VITE_API_TARGET=http://localhost:8080
```

- `VITE_USE_MOCK=false` 跳过 mock 注入，`api()` 直连 `/api/*`。
- `VITE_API_TARGET` 是 Vite dev server 的代理目标（`vite.config.js`），只在 `npm run dev` 生效。
- 生产部署时，前端 `dist/` 和后端同源即可，无需代理。

### 请求约定（切换真实后端时）

- 登录成功后，后端返回 `{user, session: {token, expires_at, ...}}`，前端把 `session.token` 存到 `localStorage`。
- 需要鉴权的请求自动带 `Authorization: Bearer <token>`。收到 `401` 会清 session 并跳转 `/login`。
- 创建 API 密钥的响应里 `secret` 字段**只返回一次**（存在 `SecretModal` 里让用户复制），后续查询不应再包含。

## 目录结构

```
frontend/
├── package.json           # Vite + React + React Router + lucide-react
├── vite.config.js         # /api 代理 → :8080（可通过 VITE_API_TARGET 覆盖）
├── index.html             # 单一 HTML 入口（SPA）
├── public/
│   └── assets/            # logo / favicon / grid-tile / signal-line
└── src/
    ├── main.jsx           # React root · BrowserRouter · mock 安装
    ├── App.jsx            # 路由表
    ├── styles/tokens.css  # 设计 token（颜色 / 字体 / 间距 / 阴影）
    ├── lib/
    │   ├── api.js         # fetch wrapper + session helper + login/logout
    │   ├── mock.js        # 浏览器内 Mock 后端
    │   └── hooks.js       # useAsync / fmtRelative
    ├── components/
    │   ├── primitives.jsx       # Button / Pill / LogoMark / SectionLabel / Loading / ErrorBox
    │   ├── dashboard-widgets.jsx # PageHeader / MetricCard / LatencyChart / RequestsTable
    │   └── RequireAuth.jsx
    └── pages/
        ├── Home.jsx · Login.jsx
        ├── marketing/Landing.jsx
        ├── dashboard/{Layout,Overview,Keys,Logs,Billing}.jsx
        └── docs/{Layout,Quickstart,Messages,Audit}.jsx
```

## 设计基线（来自 pure-claude-design-system）

- 主色 Clay `#C8553D`（仅作 accent，不做背景填充）
- 背景 Paper `#F5F1EA` / 正文 Ink `#1A1814`
- 衬线 Noto Serif SC（标题、Hero）/ 正文 Inter + Noto Sans SC / 等宽 JetBrains Mono
- 图标 lucide-react（1.5px stroke，按需 tree-shake）
- 阴影仅 `--shadow-pop` / `--shadow-modal` 两档
- `prefers-reduced-motion` 禁用动画
