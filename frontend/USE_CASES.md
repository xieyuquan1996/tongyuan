# 同源 · 用户故事与 Use Case

围绕五个表面（首页、营销站、登录/注册、控制台、开发者文档）整理常见流程。每条 case 给出：触发场景、涉及页面与接口、主路径、关键分支。

---

## UC-01 首次到访者了解产品

**角色**：潜在客户，通过搜索或口碑进入 `/`。

**触发**：浏览器打开 `https://tongyuan.ai/`。

**主路径**：
1. `/` 加载 `MarketingLanding`，并发请求 `GET /api/public/stats` / `/models` / `/plans` / `/regions` 渲染 Hero、模型表、定价表、区域状态。
2. 用户点击顶部「状态」→ 跳 `/status`，页面调 `GET /api/public/status` 渲染网关/上游/控制台各组件实时状态。
3. 用户点击「更新日志」→ 跳 `/changelog`，调 `GET /api/public/changelog`。
4. 用户点击「查看文档」→ 跳 `/docs/quickstart`。

**分支**：
- 接口失败或超时：各 section 使用 `ErrorBox` 原地降级，不阻塞整页渲染。
- 某个区域 `status = warn`：对应 badge 变橙，但整体 `overall` 仍可为 `ok`。

---

## UC-02 新用户注册并拿到第一把密钥

**角色**：新开发者。

**触发**：在营销站点击「免费开始」或在 `/login` 页点「注册」。

**主路径**：
1. 进入 `/register`，填邮箱 / 密码 / 姓名。
2. 前端 `POST /api/console/register`。
3. 服务端创建用户（plan=Starter，赠 `balance: 10.00`），签发 session，返回 `{ user, session }`。
4. 前端 `session.save(user, session)`，跳 `/dashboard/overview`。
5. `Overview` 请求 `GET /api/console/overview`，提示「还没请求，去创建第一把密钥」。
6. 用户点「新建密钥」→ 跳 `/dashboard/keys`。
7. 填名字（如 `local-dev`）→ `POST /api/console/keys`。
8. 响应带 `secret` 的完整密钥，`SecretModal` 弹出；用户复制后关闭。
9. 刷新列表（`GET /api/console/keys`），此时响应已**不含 secret**，只能看 `prefix`。

**分支**：
- 邮箱已存在：后端返回 `409 email_exists`，表单原地红字提示。
- 密码 < 6 位：`400 weak_password`。
- 用户关闭 `SecretModal` 前没复制：无法恢复，必须撤销旧密钥并新建一把。

---

## UC-03 老用户登录排查昨晚的报错

**角色**：已注册用户 Zhang，收到告警邮件说昨晚 23:47 有 5xx 尖峰。

**主路径**：
1. 打开 `/login`，表单预填 demo 账号（真实环境不会预填）。输入自己邮箱、密码。
2. `POST /api/console/login` → `200 { user, session }`；跳 `/dashboard/overview`。
3. 在 `Overview` 看 p99 延迟曲线与最近 5 条请求，发现有 500。
4. 点「查看全部」→ `/dashboard/logs`。
5. 在筛选器里选 `status=500` → `GET /api/console/logs?status=500&limit=200`。
6. 点某行 → 右侧抽屉调 `GET /api/console/logs/:id`，看到 `audit.upstream_endpoint` / `audit.match=true`，确认网关忠实转发，问题在上游。
7. 回到 `/status` 页核对上游 Anthropic 组件当时是否异常（结合 `/changelog` 的 fix 条目）。

**分支**：
- token 过期或被撤销：任何受保护接口返回 `401 unauthorized`，前端 `api.js` 统一清 session、跳 `/login`。
- 日志 `audit.match=false`：页面高亮为红色，用户应立即联系支持。

---

## UC-04 开发者在 Playground 调模型

**角色**：想在代码前先验证 prompt 效果的工程师。

**主路径**：
1. 进 `/dashboard/playground`，选模型 `claude-sonnet-4.5`，填 system / user 消息。
2. 点「运行」→ `POST /api/console/playground`，请求体与 Anthropic Messages API 对齐。
3. 返回 `{ content: [{type:"text", text:"..."}], usage, audit_id, latency_ms }`，UI 渲染助手气泡、显示 token 与延迟。
4. 同一次调用会在 `/dashboard/logs` 里多出一条记录，便于比对。

**分支**：
- 未选模型：前端本地校验，不发请求。
- 模型返回 4xx/5xx：前端展示原始 `error.message`，不伪装成 200。

---

## UC-05 创建一把专供生产环境的密钥并撤销旧 CLI 密钥

**主路径**：
1. 进 `/dashboard/keys`。
2. 新建 `production-app` → `POST /api/console/keys` → 弹 `SecretModal`，运维复制后粘到 CI 的 secret store。
3. 在列表里找到 `old-cli`（state=active）→ 点「撤销」→ `POST /api/console/keys/:id/revoke`。
4. 响应里 `state` 变 `revoked`，列表行变灰。
5. 后续任何带这把旧 key 的请求都会在上游被拒，`/logs` 里对应条目 `status=401`。

**分支**：
- 撤销不属于自己的 key：后端 `404 not_found`（前端不应出现，因为列表只展示自己的）。

---

## UC-06 控制月度花费，设置预算告警

**主路径**：
1. 进 `/dashboard/billing`，看 `used / limit / projection / next_reset`。
2. 点「充值」→ 跳 `/dashboard/recharge`。
3. 选 200 元、支付宝 → `POST /api/console/recharge` → 响应里 `balance` 更新，抽屉显示充值单号。
4. 进 `/dashboard/alerts`，启用 `balance_low`（阈值 20）和 `spend_daily`（阈值 30）。
5. 新增：`POST /api/console/alerts`；调阈值：`PATCH /api/console/alerts/:id`；删掉不需要的：`DELETE`。

**分支**：
- 充值金额 ≤ 0 或 > 100000：`400 invalid_amount`。
- 告警 `channel=browser` 需要浏览器通知权限，前端会先 `Notification.requestPermission()`；拒绝则降级为仅控制台红点。

---

## UC-07 查看账单、下载发票

**主路径**：
1. `/dashboard/billing` 下拉 → 调 `GET /api/console/invoices` 展示历史发票。
2. 点某张（`inv_2026_03`）→ 触发 PDF 下载（后端在真实环境返回带签名的下载 URL；mock 环境仅展示 JSON）。

**分支**：
- `status=pending`：按钮禁用，tooltip「对账中」。

---

## UC-08 对接到真实后端

**角色**：后端工程师，想让同一份前端跑在自己本地的 Go 网关上。

**主路径**：
1. 在 `frontend/` 新建 `.env.local`：
   ```
   VITE_USE_MOCK=false
   VITE_API_TARGET=http://localhost:8080
   ```
2. `npm run dev`，Vite 代理把 `/api/*` 转到 `:8080`。
3. 按 `API.md` 第 5 节的对接清单实现接口；先过 `POST /login` 与 `GET /me`，前端即可进入 dashboard。
4. 逐步补齐 `/overview` / `/keys` / `/logs`，每补一个接口，对应页面就能脱离 mock。

**分支**：
- 后端字段缺失：前端以 `useAsync` 展示 `ErrorBox`，其他 section 照常渲染。
- 响应结构不匹配（如 `session.token` 放到了 `data.token`）：登录看似成功但 `session.token` 为空，下一跳 `/dashboard/*` 又会 401 踢回登录页——排查方向优先看登录响应结构。

---

## UC-09 读文档、找对应 SDK 示例

**主路径**：
1. 进 `/docs`，默认重定向到 `/docs/quickstart`。
2. 左侧导航分组：
   - 入门：Quickstart · Auth · Regions
   - API：Messages · Streaming · Tools
   - 运维：Audit · Models · SLA
3. 用户按语言（cURL / Python / Node）切 tab，代码块带一键复制。

**分支**：
- 文档与真实 API 字段不一致：以 `API.md` 为准，文档站后续补更。

---

## UC-10 管理员（自己）切换深色主题、修改资料

**主路径**：
1. `/dashboard/settings`：`PATCH /api/console/profile` 改 `name` / `company` / `phone`，切 `theme=dark`。
2. 前端 `ThemeProvider` 读 `theme` 字段并写 `<html data-theme>`；刷新后仍保留。
3. 改密码：`POST /api/console/password`，旧密码错返回 `401 wrong_password`。

---

## 非功能性场景

- **离线 / Demo**：默认 mock 后端基于 `localStorage`，无网环境下仍可演示全部页面。重置：`localStorage.clear()` 或只删 `ty.mock.store.v1`。
- **无障碍**：`prefers-reduced-motion` 下关闭所有过渡动画；图标均为 lucide-react 1.5px stroke，满足对比度。
- **Token 泄露**：运维一旦把 `secret` 误发群聊，应立即走 UC-05 撤销流程；撤销 → 新建是唯一恢复路径（服务端不留明文）。
- **多 tab 会话同步**：`session` 存在 `localStorage`，一个 tab 登出会触发其他 tab 下次请求 `401` → 自动回登录页。
