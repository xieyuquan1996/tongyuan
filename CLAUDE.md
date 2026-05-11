# Claude Code — 项目规范

## 开发流程（所有任务强制执行）

**适用范围：新功能、缺陷修复、重构、配置变更——任何代码改动均适用，不得跳步。**

### 第一步：依赖链分析

改任何东西之前，先递归追踪影响范围：

1. 这个改动直接影响哪些文件/模块？
2. 依赖这些模块的上层有哪些？它们需要跟着改吗？
3. 那些上层的上层呢？
4. 一直追到没有更多需要改的为止。

**反向也要检查**：改了 A，A 依赖的 B 有没有需要同步的地方（如接口契约、类型定义、数据库结构）？

写计划前必须完成这个分析，把所有受影响的文件都列进来。漏掉的文件后面一定会出问题。

### 第二步：设计测试矩阵

在写任何代码前，先列出所有测试点，覆盖：

- **单元测试（UT）**：纯逻辑单元，无 I/O
- **组件测试（CT）**：服务层 + 真实 DB/Redis，隔离 HTTP
- **功能测试（FT）**：完整 HTTP 栈，`createApp()` + 真实 DB
- **流程功能测试（Flow FT）**：跨模块端到端场景（如"创建告警 → 触发 → 投递"完整链路）

测试矩阵要覆盖：正常路径、边界条件、失败路径、依赖链上的回归点。

### 第三步：写代码

按计划实现，每个任务提交一次。

### 第四步：跑测试矩阵

用第二步的测试点验证，不能只跑新加的用例，要跑全量测试确认没有回归。

### 第五步：诊断根因

用例不通过时，明确判断是哪层的问题：
- **计划**有漏洞（依赖链分析不完整）
- **测试点**写错了（用例本身有问题）
- **代码**有缺陷（实现错了）
- **需求理解**有误（要和用户确认）

> **顺序不能反的原因：** 先写代码再补测试，测试会迁就实现而不是验证需求；跳过依赖链分析，改了这里漏了那里，测试通过了线上还是会出问题。

---

## 测试规范

**必须测试驱动开发。** 先写失败的测试，确认它失败，再写最小实现让测试通过。

### 后端测试层级

| 层级 | 位置 | 测试内容 |
|------|------|---------|
| **单元测试（UT）** | `src/<module>.test.ts` | 纯逻辑，无 I/O（如 `shouldRefresh`、token 哈希） |
| **组件测试（CT）** | `src/<module>.test.ts` | 服务层 + 真实 DB/Redis，隔离 HTTP（如 `sessions.test.ts`、`api-keys.test.ts`） |
| **功能测试（FT）** | `src/tests/*.test.ts` | 完整 HTTP 栈，`createApp()` + 真实 DB，仅 mock 上游（如 `session-ttl.test.ts`、`e2e.test.ts`） |

改服务函数 → 需要 CT。改 HTTP 路由或中间件 → 在 CT 基础上加 FT。

### 前端测试层级

| 层级 | 位置 | 测试内容 |
|------|------|---------|
| **单元测试（UT）** | `src/lib/*.test.js` | 纯 JS 逻辑（如 `api()` 封装、session 工具函数） |
| **组件测试（CT）** | `src/components/*.test.jsx` | React 组件，mock API 调用 |

前端测试使用 vitest + jsdom，不发真实网络请求，用 `vi.spyOn(globalThis, 'fetch')` mock。

### 运行测试

```bash
# 后端（需要 DB/Redis 运行）
cd backend && docker compose up -d

# 加载环境变量（source 方式处理含特殊字符的值）
set -a && source .env && set +a

npm test              # 单元 + 组件 + 功能测试（提交前必跑）
npm run test:ft       # 仅功能测试 — src/tests/*.test.ts
npm run test:live     # 真实 SMTP 测试（*.live.test.ts）— 需要真实 SMTP 配置

npx vitest run <path> # 单文件调试

# 前端
cd frontend && npm test
```

后端测试顺序执行（`fileParallelism: false`），因为集成测试共享同一个 Postgres 实例。

真实邮件测试（`*.live.test.ts`）被排除在 `npm test` 之外，需单独用 `npm run test:live` 触发，且要求 `.env` 中有 SMTP 配置。

### 提交前检查清单

**每次提交前必须全部通过：**

```bash
cd backend
set -a && source .env && set +a

npm run typecheck   # 类型检查
npm test            # 单元 + 组件 + 功能测试
```

如果本次改动涉及邮件发送路径，还需运行：

```bash
npm run test:live   # 验证真实 SMTP 投递
```

### 测试约定

**后端：**
- 每个测试文件自行填充并清理独立数据（每个文件用唯一邮箱，`beforeAll`/`afterAll`）
- 当同一文件内的测试可能相互干扰时，用 `beforeEach` 清理共享行
- 功能测试使用 `createApp()` 和 `app.fetch()`，不需要真实 HTTP 端口
- 用 `startMockUpstream()`（见 `src/tests/mock-upstream.ts`）mock 上游 API，不 mock DB
- 不在单个测试文件中关闭 `pool`，由 `e2e.test.ts` 统一处理

**前端：**
- 在 `beforeEach` 中清空 `localStorage` 并重置 `window.location`
- 每个测试用 `vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(...)` mock 请求
- 在 `afterEach` 中调用 `vi.restoreAllMocks()`

---

## 开发环境

- **后端：** Node 22、Hono、Drizzle ORM、Postgres 16、Redis 7
- **本地 DB/Redis：** `backend/docker-compose.yml`（端口 55432 / 56379）
- **环境变量：** `backend/.env`（从 `.env.example` 复制）
- **数据库迁移：** `npx tsx src/db/migrate.ts`
- **类型检查：** `npx tsc --noEmit`

---

## 分支管理 — Git Worktree

**每次改代码都必须在独立的 worktree 中进行，不在 main 分支直接修改。**

### 创建 worktree

```bash
# 在项目根目录执行
git worktree add .worktrees/<功能名> -b <功能名>
cd .worktrees/<功能名>

# 如果 package.json 有变化，安装依赖
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
git merge <功能名>
git worktree remove .worktrees/<功能名>
git branch -d <功能名>
```

或通过 `superpowers:finishing-a-development-branch` 技能处理合并/PR 流程。

---

## 前端界面规范

### 组件使用

- 所有表单输入使用 `Input` 组件（来自 `primitives.jsx`），禁止直接写原始 `<input>` 标签
- 所有下拉选择使用 `Select` 组件
- 表单区域必须用 `FormField` 包裹（提供标签和错误展示）
- 操作成功/信息提示用 `useToast()`（来自 `Toast.jsx`），错误/警告用 `Banner` 内嵌页面
- 按钮使用 `Button` 组件，主操作 `variant="primary"`，次要 `variant="secondary"`

### 样式规则

- 颜色只用 `tokens.css` 中的语义 CSS 变量，禁止写 hex/rgba 字面量
- 间距遵循 8px 网格：8、16、24、32、48
- 圆角使用 token：`--radius-sm`（4px）/ `--radius-md`（8px）/ `--radius-lg`（12px）
- 字体只用 `--font-serif` / `--font-sans` / `--font-mono`
- 深浅主题通过 token 自动适配，组件内不写任何深色模式条件判断

### 禁止事项

- 禁止在页面内重新定义 Box / Card / Row 等局部组件，使用 `primitives.jsx` 中的共享组件
- 禁止 `style={{ color: "#xxx" }}` 等硬编码颜色
- 禁止绕过 `FormField`，直接写原始 label + input 标签
