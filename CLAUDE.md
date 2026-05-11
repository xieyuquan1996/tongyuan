# Claude Code — Project Guidelines

## 开发流程（所有任务强制执行）

**适用范围：新功能、bug fix、重构、配置变更——任何代码改动均适用，不得跳步。**

### 第一步：依赖链分析

改任何东西之前，先递归追踪影响范围：

1. 这个改动直接影响哪些文件/模块？
2. 依赖这些模块的上层有哪些？它们需要跟着改吗？
3. 那些上层的上层呢？
4. 一直追到没有更多需要改的为止。

**反向也要检查**：改了 A，A 依赖的 B 有没有需要同步的地方（如接口契约、类型定义、数据库 schema）？

写计划前必须完成这个分析，把所有受影响的文件都列进来。漏掉的文件后面一定会出问题。

### 第二步：设计测试矩阵

在写任何代码前，先列出所有测试点，覆盖：

- **UT**：纯逻辑单元（无 I/O）
- **CT**：service + 真实 DB/Redis，隔离 HTTP
- **FT**：完整 HTTP 栈，`createApp()` + 真实 DB
- **Flow FT**：跨模块端到端场景（如"创建告警 → 触发 → 投递"完整链路）

测试矩阵要覆盖：正常路径、边界条件、失败路径、依赖链上的回归点。

### 第三步：写代码

按计划实现，每个 task 提交一次。

### 第四步：跑测试矩阵

用第二步的测试点验证，不能只跑新加的 case，要跑全量测试确认没有回归。

### 第五步：诊断根因

case 不过时，明确判断是哪层的问题：
- **计划**有漏洞（依赖链分析不完整）
- **测试点**写错了（case 本身有问题）
- **代码**有 bug（实现错了）
- **需求理解**有误（要和用户确认）

> **顺序不能反的原因：** 先写代码再补测试，测试会迁就实现而不是验证需求；跳过依赖链分析，改了这里漏了那里，测试通过了线上还是会出问题。

---

## Testing

**Test-driven development is required.** Write the failing test first, watch it fail, then write the minimum implementation to pass.

### Test layers

Every feature or bug fix must have tests at the appropriate level:

| Layer | Location | What it tests |
|-------|----------|---------------|
| **Unit (UT)** | `src/<module>.test.ts` | Pure logic, no I/O (e.g. `shouldRefresh`, token hashing) |
| **Component (CT)** | `src/<module>.test.ts` | Service + real DB/Redis, isolated from HTTP (e.g. `sessions.test.ts`, `api-keys.test.ts`) |
| **Functional (FT)** | `src/tests/*.test.ts` | Full HTTP stack via `createApp()` + real DB, no mocks except upstream (e.g. `session-ttl.test.ts`, `e2e.test.ts`) |

A change to a service function → needs CT. A change to an HTTP route or middleware → needs FT on top of CT.

### Frontend test layers

| Layer | Location | What it tests |
|-------|----------|---------------|
| **Unit (UT)** | `src/lib/*.test.js` | Pure JS logic (e.g. `api()` fetch wrapper, session helpers) |
| **Component (CT)** | `src/components/*.test.jsx` | React components with mocked API calls |

Frontend tests use vitest + jsdom. No real network — mock `fetch` with `vi.spyOn(globalThis, 'fetch')`.

### Running tests

```bash
# Backend (requires running DB/Redis)
cd backend && docker compose up -d

# Load env (use source to handle values with special chars like angle brackets)
set -a && source .env && set +a

npm test          # UT + CT + FT（提交前必跑）
npm run test:ft   # FT only — src/tests/*.test.ts
npm run test:live # Live SMTP tests (*.live.test.ts) — 需要真实 SMTP 配置

npx vitest run <path>   # 单文件调试

# Frontend
cd frontend && npm test
```

Backend tests run sequentially (`fileParallelism: false`) because integration tests share a single Postgres instance.

Live tests（`*.live.test.ts`）被排除在 `npm test` 之外，需单独用 `npm run test:live` 触发，且要求 `.env` 中有 SMTP 配置。

### 提交前检查清单

**每次提交前必须全部通过：**

```bash
cd backend
set -a && source .env && set +a

npm run typecheck   # 类型检查
npm test            # UT + CT + FT
```

如果本次改动涉及邮件发送路径，还需运行：

```bash
npm run test:live   # 验证真实 SMTP 投递
```

### Test conventions

**Backend:**
- Each test file seeds and cleans up its own isolated data (unique email per file, `beforeAll`/`afterAll`)
- Use `beforeEach` to clear shared rows when tests within a file could interfere
- FTs use `createApp()` and `app.fetch()` — no real HTTP port needed
- Mock the upstream API with `startMockUpstream()` (see `src/tests/mock-upstream.ts`), not the DB
- Don't close `pool` in individual test files; `e2e.test.ts` handles teardown

**Frontend:**
- `localStorage.clear()` and reset `window.location` in `beforeEach`
- Mock `fetch` per test with `vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(...)`
- `vi.restoreAllMocks()` in `afterEach`

## Dev environment

- **Backend:** Node 22, Hono, Drizzle ORM, Postgres 16, Redis 7
- **Local DB/Redis:** `backend/docker-compose.yml` (ports 55432 / 56379)
- **Env:** `backend/.env` (copy from `.env.example`)
- **Migrations:** `npx tsx src/db/migrate.ts`
- **Typecheck:** `npx tsc --noEmit`

## Development workflow — Git Worktrees

**每次改代码都必须在独立的 worktree 中进行，不在 main 分支直接修改。**

### 创建 worktree

```bash
# 在项目根目录执行
git worktree add .worktrees/<feature-name> -b <feature-name>
cd .worktrees/<feature-name>

# 安装依赖（如果 package.json 有变化）
cd backend && npm install && cd ..

# 验证基线测试通过
cd backend
set -a && source .env && set +a
npm test
```

`.worktrees/` 已加入 `.gitignore`，不会被 git 追踪。

### 完成后合并

```bash
# 在 worktree 内确认测试全通过后
cd /path/to/project-root   # 切回主仓库
git merge <feature-name>
git worktree remove .worktrees/<feature-name>
git branch -d <feature-name>
```

或通过 `superpowers:finishing-a-development-branch` 技能处理合并 / PR 流程。

## Frontend UI Rules

### 组件使用

- 所有表单输入使用 `Input` 组件（from `primitives.jsx`），禁止内联 style 写 `<input>`
- 所有下拉选择使用 `Select` 组件
- 表单区域必须用 `FormField` 包裹（提供 label + error 展示）
- 操作成功/信息提示用 `useToast()`（from `Toast.jsx`），错误/警告用 `Banner` 内嵌页面
- 按钮使用 `Button` 组件，主操作 `variant="primary"`，次要 `variant="secondary"`

### 样式规则

- 颜色只用 `tokens.css` 中的语义 CSS 变量，禁止写 hex/rgba 字面量
- 间距遵循 8px 网格：8, 16, 24, 32, 48
- 圆角使用 token：`--radius-sm`(4px) / `--radius-md`(8px) / `--radius-lg`(12px)
- 字体只用 `--font-serif` / `--font-sans` / `--font-mono`
- 深浅主题通过 token 自动适配，组件内不写任何 dark mode 条件判断

### 禁止事项

- 禁止在页面内重新定义 Box / Card / Row 等局部组件，使用 primitives.jsx 中的共享组件
- 禁止 `style={{ color: "#xxx" }}` 等硬编码颜色
- 禁止绕过 FormField 直接裸写 label + input
