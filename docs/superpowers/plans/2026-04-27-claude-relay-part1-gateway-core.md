# Claude 中转网关 MVP — Part 1 实施计划（网关核心）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 spec 里的里程碑 1-5 落地：从零起 Node/Hono 骨架，打通用户鉴权 + 上游 Key 池 + `/v1/messages` 流式与非流式转发。做完后用户能从 SDK 调网关，计费、审计哈希、上游故障切换全部生效。

**Architecture:** Hono + TypeScript + Drizzle + Postgres + Redis，模块按 `middleware / gateway / routes / services` 切分。网关核心（scheduler + proxy + audit + meter + biller）是独立可测的纯服务层，HTTP 路由只负责粘合。

**Tech Stack:** Node.js 20 · Hono · Drizzle ORM · Postgres 16 · Redis 7 · `@anthropic-ai/sdk` · Vitest · TypeScript 5 · Docker Compose · zod · bcryptjs · pino

**Spec:** `docs/superpowers/specs/2026-04-27-claude-relay-mvp-design.md`

**Part 2（不在本计划内）**：Logs/Overview/Billing 只读接口、Playground、限流与幂等中间件的集成、公开接口静态化、e2e 测试、部署脚本。

---

## File Structure

```
backend/                         # 新建子目录
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── drizzle.config.ts
├── docker-compose.yml           # pg + redis + app
├── Dockerfile
├── .env.example
└── src/
    ├── index.ts                 # Hono 入口
    ├── app.ts                   # 路由挂载（便于测试不起监听）
    ├── env.ts                   # 环境变量 schema
    ├── logger.ts                # pino
    ├── db/
    │   ├── client.ts
    │   ├── schema.ts
    │   └── migrations/          # drizzle-kit 生成
    ├── redis/
    │   └── client.ts
    ├── shared/
    │   ├── errors.ts            # AppError + 映射
    │   └── canonicalize.ts      # JSON canonicalize + sha256
    ├── crypto/
    │   ├── password.ts          # bcrypt
    │   ├── tokens.ts            # session / api-key 生成
    │   └── kms.ts               # AES-256-GCM
    ├── services/
    │   ├── users.ts
    │   ├── sessions.ts
    │   ├── api-keys.ts
    │   ├── upstream-keys.ts
    │   ├── models.ts
    │   └── logs.ts
    ├── gateway/
    │   ├── scheduler.ts         # UpstreamScheduler
    │   ├── proxy.ts             # 转发上游（非流）
    │   ├── sse.ts               # SSE 帧解析 + 用量抽取
    │   ├── meter.ts             # token → cost
    │   └── biller.ts            # 事务扣费
    ├── middleware/
    │   ├── error.ts
    │   ├── auth-bearer.ts       # console session
    │   ├── auth-api-key.ts      # sk-relay-*
    │   └── auth-admin.ts
    └── routes/
        ├── v1/
        │   ├── messages.ts
        │   ├── count-tokens.ts
        │   └── models.ts
        ├── console/
        │   ├── auth.ts
        │   └── keys.ts
        └── admin/
            ├── upstream-keys.ts
            └── models.ts
```

每个 task 落到具体文件，不跨越模块边界。

---

## Milestone 1 — 骨架

### Task 1: 初始化 backend 项目骨架

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/.gitignore`
- Create: `backend/src/index.ts`
- Create: `backend/src/app.ts`

- [ ] **Step 1: 创建目录并初始化 package.json**

```bash
mkdir -p backend/src && cd backend
cat > package.json <<'EOF'
{
  "name": "claude-link-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "@hono/node-server": "^1.13.0",
    "@hono/zod-validator": "^0.4.0",
    "bcryptjs": "^2.4.3",
    "drizzle-orm": "^0.36.0",
    "hono": "^4.6.0",
    "ioredis": "^5.4.0",
    "pg": "^8.13.0",
    "pino": "^9.5.0",
    "ulid": "^2.3.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.0",
    "drizzle-kit": "^0.28.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
EOF
```

- [ ] **Step 2: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: 写 .gitignore**

```
node_modules
dist
.env
.env.local
data/
coverage/
```

- [ ] **Step 4: 写 src/app.ts（空壳 Hono app，不启动监听）**

```ts
import { Hono } from 'hono'

export function createApp() {
  const app = new Hono()
  app.get('/healthz', (c) => c.json({ ok: true }))
  return app
}
```

- [ ] **Step 5: 写 src/index.ts（启动监听）**

```ts
import { serve } from '@hono/node-server'
import { createApp } from './app.js'

const app = createApp()
const port = Number(process.env.PORT ?? 8080)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`listening on :${info.port}`)
})
```

- [ ] **Step 6: 安装依赖**

Run: `cd backend && npm install`
Expected: 无错误；`node_modules` 和 `package-lock.json` 生成。

- [ ] **Step 7: 冒烟跑**

Run: `cd backend && npm run dev` 起一个终端，另一终端 `curl localhost:8080/healthz`
Expected: `{"ok":true}`；手动 Ctrl+C 停掉 dev。

- [ ] **Step 8: Commit**

```bash
cd backend && git init  # 如果项目根还不是 git 仓库
cd .. && git add backend/ && git commit -m "chore(backend): init Hono skeleton"
```

---

### Task 2: 环境变量校验（zod）

**Files:**
- Create: `backend/src/env.ts`
- Create: `backend/.env.example`
- Create: `backend/src/env.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// backend/src/env.test.ts
import { describe, it, expect } from 'vitest'
import { parseEnv } from './env.js'

describe('parseEnv', () => {
  it('accepts a valid env', () => {
    const e = parseEnv({
      NODE_ENV: 'test',
      PORT: '8080',
      DATABASE_URL: 'postgres://u:p@h:5432/d',
      REDIS_URL: 'redis://h:6379',
      SESSION_SECRET: 'a'.repeat(32),
      UPSTREAM_KEY_KMS: 'b'.repeat(64),
      ANTHROPIC_UPSTREAM_BASE_URL: 'https://api.anthropic.com',
    })
    expect(e.PORT).toBe(8080)
    expect(e.UPSTREAM_KEY_KMS).toHaveLength(64)
  })

  it('rejects a short KMS key', () => {
    expect(() => parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://u:p@h:5432/d',
      REDIS_URL: 'redis://h:6379',
      SESSION_SECRET: 'a'.repeat(32),
      UPSTREAM_KEY_KMS: 'short',
      ANTHROPIC_UPSTREAM_BASE_URL: 'https://api.anthropic.com',
    })).toThrow()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx vitest run src/env.test.ts`
Expected: FAIL — `parseEnv` 不存在。

- [ ] **Step 3: 实现 env.ts**

```ts
// backend/src/env.ts
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  UPSTREAM_KEY_KMS: z.string().length(64, 'must be 64 hex chars (32 bytes)'),
  ANTHROPIC_UPSTREAM_BASE_URL: z.string().url().default('https://api.anthropic.com'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  METRICS_TOKEN: z.string().optional(),
})

export type Env = z.infer<typeof schema>

export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  return schema.parse(raw)
}

export const env = parseEnv(process.env)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx vitest run src/env.test.ts`
Expected: PASS（两条用例都绿）。

- [ ] **Step 5: 写 .env.example**

```
NODE_ENV=development
PORT=8080
DATABASE_URL=postgres://postgres:postgres@localhost:5432/claude_link
REDIS_URL=redis://localhost:6379
SESSION_SECRET=please-generate-32-plus-char-random-string
UPSTREAM_KEY_KMS=0000000000000000000000000000000000000000000000000000000000000000
ANTHROPIC_UPSTREAM_BASE_URL=https://api.anthropic.com
LOG_LEVEL=info
METRICS_TOKEN=
```

- [ ] **Step 6: Commit**

```bash
git add backend/ && git commit -m "feat(backend): typed env via zod"
```

---

### Task 3: Docker Compose（postgres + redis）

**Files:**
- Create: `backend/docker-compose.yml`
- Create: `backend/Dockerfile`

- [ ] **Step 1: 写 docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: claude_link
    ports: ["5432:5432"]
    volumes:
      - ./data/pg:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
```

- [ ] **Step 2: 写 Dockerfile（留给后续构建 app 镜像）**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: 起依赖**

Run: `cd backend && docker compose up -d postgres redis`
Expected: 两个容器健康。

- [ ] **Step 4: 验证**

Run: `docker compose ps`
Expected: postgres 和 redis 都是 `healthy`。

- [ ] **Step 5: Commit**

```bash
git add backend/docker-compose.yml backend/Dockerfile && git commit -m "chore(backend): add docker-compose for pg+redis"
```

---

### Task 4: Drizzle setup + 第一张表（users）

**Files:**
- Create: `backend/drizzle.config.ts`
- Create: `backend/src/db/schema.ts`
- Create: `backend/src/db/client.ts`
- Create: `backend/src/db/migrate.ts`

- [ ] **Step 1: 写 drizzle.config.ts**

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/claude_link',
  },
})
```

- [ ] **Step 2: 写 src/db/schema.ts（仅 users 表，后续 task 增量加）**

```ts
import { pgTable, uuid, text, timestamp, numeric, boolean } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull().default(''),
  role: text('role').notNull().default('user'),         // 'user' | 'admin'
  status: text('status').notNull().default('active'),    // 'active' | 'suspended'
  plan: text('plan').notNull().default('Starter'),
  balanceUsd: numeric('balance_usd', { precision: 12, scale: 6 }).notNull().default('10.000000'),
  limitMonthlyUsd: numeric('limit_monthly_usd', { precision: 12, scale: 6 }),
  theme: text('theme').notNull().default('light'),
  company: text('company').notNull().default(''),
  phone: text('phone').notNull().default(''),
  notifyEmail: boolean('notify_email').notNull().default(true),
  notifyBrowser: boolean('notify_browser').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 3: 写 src/db/client.ts**

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { env } from '../env.js'
import * as schema from './schema.js'

const pool = new pg.Pool({ connectionString: env.DATABASE_URL })
export const db = drizzle(pool, { schema })
export { pool }
```

- [ ] **Step 4: 写 src/db/migrate.ts**

```ts
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db, pool } from './client.js'

await migrate(db, { migrationsFolder: './src/db/migrations' })
await pool.end()
console.log('migrations applied')
```

- [ ] **Step 5: 生成迁移**

Run: `cd backend && npm run db:generate`
Expected: `src/db/migrations/0000_*.sql` 生成。

- [ ] **Step 6: 应用迁移**

Run: `cd backend && DATABASE_URL=postgres://postgres:postgres@localhost:5432/claude_link npm run db:migrate`
Expected: `migrations applied`。

- [ ] **Step 7: 验证表存在**

Run: `docker compose exec postgres psql -U postgres -d claude_link -c '\d users'`
Expected: 看到 users 的列清单。

- [ ] **Step 8: Commit**

```bash
git add backend/ && git commit -m "feat(db): init drizzle + users table"
```

---

### Task 5: AppError + error middleware

**Files:**
- Create: `backend/src/shared/errors.ts`
- Create: `backend/src/shared/errors.test.ts`
- Create: `backend/src/middleware/error.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: 写失败测试**

```ts
// backend/src/shared/errors.test.ts
import { describe, it, expect } from 'vitest'
import { AppError, toErrorBody } from './errors.js'

describe('AppError', () => {
  it('maps code to http status', () => {
    expect(new AppError('unauthorized').status).toBe(401)
    expect(new AppError('insufficient_balance').status).toBe(402)
    expect(new AppError('not_found').status).toBe(404)
    expect(new AppError('all_upstreams_down').status).toBe(502)
  })

  it('serializes body', () => {
    const e = new AppError('invalid_email', 'bad format')
    expect(toErrorBody(e)).toEqual({ error: 'invalid_email', message: 'bad format' })
  })

  it('wraps unknown as mock_error', () => {
    const e = new Error('oops')
    const body = toErrorBody(e)
    expect(body.error).toBe('internal_error')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx vitest run src/shared/errors.test.ts`
Expected: FAIL.

- [ ] **Step 3: 实现 errors.ts**

```ts
// backend/src/shared/errors.ts
export type ErrorCode =
  | 'unauthorized' | 'invalid_credentials' | 'wrong_password'
  | 'missing_fields' | 'invalid_email' | 'weak_password' | 'invalid_amount'
  | 'email_exists' | 'model_exists'
  | 'account_suspended' | 'forbidden'
  | 'not_found' | 'route_not_found'
  | 'insufficient_balance' | 'rate_limit'
  | 'unknown_model' | 'method_not_allowed'
  | 'all_upstreams_down' | 'upstream_error'
  | 'not_implemented' | 'internal_error'

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401, invalid_credentials: 401, wrong_password: 401,
  missing_fields: 400, invalid_email: 400, weak_password: 400, invalid_amount: 400,
  unknown_model: 400,
  insufficient_balance: 402,
  account_suspended: 403, forbidden: 403,
  not_found: 404, route_not_found: 404,
  method_not_allowed: 405,
  email_exists: 409, model_exists: 409,
  rate_limit: 429,
  internal_error: 500,
  not_implemented: 501,
  all_upstreams_down: 502, upstream_error: 502,
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  constructor(code: ErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
    this.status = STATUS[code]
  }
}

export function toErrorBody(e: unknown): { error: ErrorCode; message?: string } {
  if (e instanceof AppError) return { error: e.code, message: e.message !== e.code ? e.message : undefined }
  return { error: 'internal_error', message: e instanceof Error ? e.message : String(e) }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd backend && npx vitest run src/shared/errors.test.ts`
Expected: PASS。

- [ ] **Step 5: 实现 error middleware**

```ts
// backend/src/middleware/error.ts
import type { MiddlewareHandler } from 'hono'
import { AppError, toErrorBody } from '../shared/errors.js'

export const errorMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    await next()
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500
    return c.json(toErrorBody(e), status as 400)
  }
}
```

- [ ] **Step 6: 挂到 app.ts**

```ts
import { Hono } from 'hono'
import { errorMiddleware } from './middleware/error.js'

export function createApp() {
  const app = new Hono()
  app.use('*', errorMiddleware)
  app.get('/healthz', (c) => c.json({ ok: true }))
  app.notFound((c) => c.json({ error: 'route_not_found' }, 404))
  return app
}
```

- [ ] **Step 7: Commit**

```bash
git add backend/ && git commit -m "feat(backend): AppError + error middleware"
```

---

### Task 6: Redis client

**Files:**
- Create: `backend/src/redis/client.ts`

- [ ] **Step 1: 实现**

```ts
// backend/src/redis/client.ts
import Redis from 'ioredis'
import { env } from '../env.js'

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
})

redis.on('error', (err) => {
  console.error('redis error', err)
})
```

- [ ] **Step 2: 冒烟**

Run: `cd backend && node --input-type=module -e "import('./dist/redis/client.js').then(m=>m.redis.set('k','v').then(()=>m.redis.get('k')).then(console.log).then(()=>m.redis.quit()))"`

更简单：写个一次性 ts 脚本跑一下，或先 `npm run build`。MVP 阶段可以先跳过这一步，下一任务里联调时一并验。

- [ ] **Step 3: Commit**

```bash
git add backend/src/redis/ && git commit -m "feat(backend): redis client"
```

---

## Milestone 2 — 鉴权

### Task 7: 密码 hash 工具

**Files:**
- Create: `backend/src/crypto/password.ts`
- Create: `backend/src/crypto/password.test.ts`

- [ ] **Step 1: 失败测试**

```ts
// backend/src/crypto/password.test.ts
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './password.js'

describe('password', () => {
  it('hashes and verifies', async () => {
    const h = await hashPassword('secret123')
    expect(h).not.toBe('secret123')
    expect(await verifyPassword('secret123', h)).toBe(true)
    expect(await verifyPassword('wrong', h)).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx vitest run src/crypto/password.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
// backend/src/crypto/password.ts
import bcrypt from 'bcryptjs'

const COST = 12

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && npx vitest run src/crypto/password.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/src/crypto/ && git commit -m "feat(crypto): bcrypt password helpers"
```

---

### Task 8: Token 生成工具（session + api-key）

**Files:**
- Create: `backend/src/crypto/tokens.ts`
- Create: `backend/src/crypto/tokens.test.ts`

- [ ] **Step 1: 失败测试**

```ts
// backend/src/crypto/tokens.test.ts
import { describe, it, expect } from 'vitest'
import { newSessionToken, hashSessionToken, newApiKey, API_KEY_PREFIX_LEN } from './tokens.js'

describe('tokens', () => {
  it('session token is base64url 43-char and hash is deterministic', () => {
    const t = newSessionToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(hashSessionToken(t)).toBe(hashSessionToken(t))
    expect(hashSessionToken(t)).not.toBe(t)
  })

  it('api key starts with sk-relay- and exposes stable prefix', () => {
    const { secret, prefix } = newApiKey()
    expect(secret.startsWith('sk-relay-')).toBe(true)
    expect(prefix).toBe(secret.slice(0, API_KEY_PREFIX_LEN))
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd backend && npx vitest run src/crypto/tokens.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
// backend/src/crypto/tokens.ts
import { createHash, randomBytes } from 'node:crypto'

export const API_KEY_PREFIX_LEN = 16  // 'sk-relay-' + 7 chars

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
function randBase62(n: number): string {
  const buf = randomBytes(n)
  let out = ''
  for (let i = 0; i < n; i++) out += BASE62[buf[i]! % 62]
  return out
}

export function newApiKey(): { secret: string; prefix: string } {
  const secret = 'sk-relay-' + randBase62(40)
  return { secret, prefix: secret.slice(0, API_KEY_PREFIX_LEN) }
}
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && npx vitest run src/crypto/tokens.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/src/crypto/ && git commit -m "feat(crypto): session + api-key token helpers"
```

---

### Task 9: users service + sessions schema

**Files:**
- Modify: `backend/src/db/schema.ts`（增 sessions 表）
- Create: `backend/src/services/users.ts`

- [ ] **Step 1: 在 schema.ts 末尾追加 sessions 表**

```ts
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 2: 生成并执行迁移**

```bash
cd backend && npm run db:generate && npm run db:migrate
```

Expected: 生成 `0001_*.sql`，应用成功。

- [ ] **Step 3: 写 users service**

```ts
// backend/src/services/users.ts
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { AppError } from '../shared/errors.js'
import { hashPassword, verifyPassword } from '../crypto/password.js'

export type UserRow = typeof users.$inferSelect

export async function createUser(input: { email: string; password: string; name: string }): Promise<UserRow> {
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('invalid_email')
  if (input.password.length < 6) throw new AppError('weak_password')

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (existing) throw new AppError('email_exists')

  const passwordHash = await hashPassword(input.password)
  const [row] = await db.insert(users).values({ email, passwordHash, name: input.name ?? '' }).returning()
  return row!
}

export async function authenticate(email: string, password: string): Promise<UserRow> {
  const row = await db.query.users.findFirst({ where: eq(users.email, email.trim().toLowerCase()) })
  if (!row) throw new AppError('invalid_credentials')
  const ok = await verifyPassword(password, row.passwordHash)
  if (!ok) throw new AppError('invalid_credentials')
  if (row.status === 'suspended') throw new AppError('account_suspended')
  return row
}

export function toPublicUser(row: UserRow) {
  const { passwordHash: _omit, ...rest } = row
  return rest
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/ && git commit -m "feat(services): users + sessions schema"
```

---

### Task 10: sessions service

**Files:**
- Create: `backend/src/services/sessions.ts`

- [ ] **Step 1: 实现**

```ts
// backend/src/services/sessions.ts
import { eq, lt } from 'drizzle-orm'
import { db } from '../db/client.js'
import { sessions } from '../db/schema.js'
import { newSessionToken, hashSessionToken } from '../crypto/tokens.js'
import { AppError } from '../shared/errors.js'

const TTL_DAYS = 30

export async function issueSession(userId: string) {
  const token = newSessionToken()
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 3600 * 1000)
  const [row] = await db.insert(sessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  }).returning()
  return { token, session: row! }
}

export async function resolveSession(token: string) {
  const row = await db.query.sessions.findFirst({
    where: eq(sessions.tokenHash, hashSessionToken(token)),
  })
  if (!row) throw new AppError('unauthorized')
  if (row.expiresAt < new Date()) throw new AppError('unauthorized')
  return row
}

export async function revokeSession(token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)))
}

export async function purgeExpired() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/sessions.ts && git commit -m "feat(services): sessions"
```

---

### Task 11: POST /api/console/register

**Files:**
- Create: `backend/src/routes/console/auth.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/src/routes/console/auth.test.ts`

- [ ] **Step 1: 写路由**

```ts
// backend/src/routes/console/auth.ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { createUser, authenticate, toPublicUser } from '../../services/users.js'
import { issueSession } from '../../services/sessions.js'

export const authRoutes = new Hono()

const registerBody = z.object({
  email: z.string(),
  password: z.string(),
  name: z.string().optional().default(''),
})

authRoutes.post('/register', zValidator('json', registerBody), async (c) => {
  const b = c.req.valid('json')
  const user = await createUser({ email: b.email, password: b.password, name: b.name })
  const { token, session } = await issueSession(user.id)
  return c.json({
    user: toPublicUser(user),
    session: { token, user_id: user.id, created_at: session.createdAt, expires_at: session.expiresAt },
  }, 201)
})

const loginBody = z.object({ email: z.string(), password: z.string() })

authRoutes.post('/login', zValidator('json', loginBody), async (c) => {
  const b = c.req.valid('json')
  const user = await authenticate(b.email, b.password)
  const { token, session } = await issueSession(user.id)
  return c.json({
    user: toPublicUser(user),
    session: { token, user_id: user.id, created_at: session.createdAt, expires_at: session.expiresAt },
  })
})
```

- [ ] **Step 2: 挂到 app.ts**

```ts
import { Hono } from 'hono'
import { errorMiddleware } from './middleware/error.js'
import { authRoutes } from './routes/console/auth.js'

export function createApp() {
  const app = new Hono()
  app.use('*', errorMiddleware)
  app.get('/healthz', (c) => c.json({ ok: true }))
  app.route('/api/console', authRoutes)
  app.notFound((c) => c.json({ error: 'route_not_found' }, 404))
  return app
}
```

- [ ] **Step 3: 写集成测试**

```ts
// backend/src/routes/console/auth.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../../app.js'
import { pool } from '../../db/client.js'

const app = createApp()

async function post(path: string, body: unknown) {
  return app.fetch(new Request('http://localhost' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

beforeAll(async () => {
  await pool.query("DELETE FROM sessions; DELETE FROM users WHERE email LIKE 'auth-test-%'")
})
afterAll(async () => { await pool.end() })

describe('auth routes', () => {
  it('registers then logs in', async () => {
    const email = `auth-test-${Date.now()}@example.com`
    const r1 = await post('/api/console/register', { email, password: 'secret123', name: 'T' })
    expect(r1.status).toBe(201)
    const j1 = await r1.json()
    expect(j1.user.email).toBe(email)
    expect(j1.session.token).toBeDefined()

    const r2 = await post('/api/console/login', { email, password: 'secret123' })
    expect(r2.status).toBe(200)
    const j2 = await r2.json()
    expect(j2.session.token).not.toBe(j1.session.token)
  })

  it('rejects duplicate email', async () => {
    const email = `auth-test-${Date.now()}-dup@example.com`
    await post('/api/console/register', { email, password: 'secret123' })
    const r = await post('/api/console/register', { email, password: 'secret123' })
    expect(r.status).toBe(409)
    expect((await r.json()).error).toBe('email_exists')
  })

  it('rejects weak password', async () => {
    const r = await post('/api/console/register', { email: 'wp@x.com', password: '12' })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('weak_password')
  })
})
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && DATABASE_URL=postgres://postgres:postgres@localhost:5432/claude_link REDIS_URL=redis://localhost:6379 SESSION_SECRET=$(openssl rand -hex 32) UPSTREAM_KEY_KMS=$(openssl rand -hex 32) npx vitest run src/routes/console/auth.test.ts`
Expected: 三条用例 PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/ && git commit -m "feat(console): register + login endpoints"
```

---

### Task 12: Bearer auth middleware + me / logout

**Files:**
- Create: `backend/src/middleware/auth-bearer.ts`
- Modify: `backend/src/routes/console/auth.ts`

- [ ] **Step 1: 实现 middleware**

```ts
// backend/src/middleware/auth-bearer.ts
import type { MiddlewareHandler } from 'hono'
import { AppError } from '../shared/errors.js'
import { resolveSession } from '../services/sessions.js'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import type { UserRow } from '../services/users.js'

declare module 'hono' {
  interface ContextVariableMap {
    user: UserRow
    sessionToken: string
  }
}

export const requireBearer: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  if (!m) throw new AppError('unauthorized')
  const token = m[1]!
  const session = await resolveSession(token)
  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) })
  if (!user) throw new AppError('unauthorized')
  if (user.status === 'suspended') throw new AppError('account_suspended')
  c.set('user', user)
  c.set('sessionToken', token)
  await next()
}
```

- [ ] **Step 2: 扩展 auth.ts 加 me/logout/profile/password**

```ts
// 在 authRoutes 已有内容后追加：
import { requireBearer } from '../../middleware/auth-bearer.js'
import { revokeSession } from '../../services/sessions.js'
import { hashPassword, verifyPassword } from '../../crypto/password.js'
import { AppError } from '../../shared/errors.js'
import { db } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

authRoutes.post('/logout', requireBearer, async (c) => {
  await revokeSession(c.get('sessionToken'))
  return c.json({ ok: true })
})

authRoutes.get('/me', requireBearer, (c) => c.json(toPublicUser(c.get('user'))))

const profileBody = z.object({
  name: z.string().optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  theme: z.enum(['light', 'dark']).optional(),
  notify_email: z.boolean().optional(),
  notify_browser: z.boolean().optional(),
})
authRoutes.patch('/profile', requireBearer, zValidator('json', profileBody), async (c) => {
  const u = c.get('user')
  const b = c.req.valid('json')
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (b.name !== undefined) patch.name = b.name
  if (b.company !== undefined) patch.company = b.company
  if (b.phone !== undefined) patch.phone = b.phone
  if (b.theme !== undefined) patch.theme = b.theme
  if (b.notify_email !== undefined) patch.notifyEmail = b.notify_email
  if (b.notify_browser !== undefined) patch.notifyBrowser = b.notify_browser
  const [row] = await db.update(users).set(patch).where(eq(users.id, u.id)).returning()
  return c.json(toPublicUser(row!))
})

const passwordBody = z.object({ current: z.string(), next: z.string() })
authRoutes.post('/password', requireBearer, zValidator('json', passwordBody), async (c) => {
  const u = c.get('user')
  const b = c.req.valid('json')
  if (!(await verifyPassword(b.current, u.passwordHash))) throw new AppError('wrong_password')
  if (b.next.length < 6) throw new AppError('weak_password')
  await db.update(users).set({ passwordHash: await hashPassword(b.next), updatedAt: new Date() }).where(eq(users.id, u.id))
  return c.json({ ok: true })
})

authRoutes.post('/forgot', async (c) => c.json({ ok: true, hint: '如果该邮箱已注册，我们已经发送了重置链接。' }))
```

- [ ] **Step 3: 跑已有测试防止回归**

Run: `cd backend && npx vitest run`
Expected: 所有 PASS。

- [ ] **Step 4: Commit**

```bash
git add backend/ && git commit -m "feat(console): me/logout/profile/password"
```

---

### Task 13: api_keys 表 + service

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/src/services/api-keys.ts`

- [ ] **Step 1: 加表**

```ts
// 追加到 schema.ts
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  secretHash: text('secret_hash').notNull(),
  state: text('state').notNull().default('active'), // 'active' | 'revoked'
  rpmLimit: numeric('rpm_limit'),
  tpmLimit: numeric('tpm_limit'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})
```

- [ ] **Step 2: 迁移**

Run: `cd backend && npm run db:generate && npm run db:migrate`

- [ ] **Step 3: service**

```ts
// backend/src/services/api-keys.ts
import { eq, and, desc } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '../db/client.js'
import { apiKeys } from '../db/schema.js'
import { newApiKey } from '../crypto/tokens.js'
import { AppError } from '../shared/errors.js'

export type ApiKeyRow = typeof apiKeys.$inferSelect

export function toPublicKey(row: ApiKeyRow) {
  const { secretHash: _omit, ...rest } = row
  return rest
}

export async function createKey(userId: string, name: string) {
  const { secret, prefix } = newApiKey()
  const secretHash = await bcrypt.hash(secret, 12)
  const [row] = await db.insert(apiKeys).values({ userId, name, prefix, secretHash }).returning()
  return { row: row!, secret }
}

export async function listKeys(userId: string) {
  return db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt))
}

export async function revokeKey(userId: string, id: string): Promise<ApiKeyRow> {
  const [row] = await db.update(apiKeys)
    .set({ state: 'revoked', revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
    .returning()
  if (!row) throw new AppError('not_found')
  return row
}

// 用于网关鉴权：按 prefix 拉所有候选再 bcrypt 比对
export async function resolveKey(secret: string): Promise<ApiKeyRow> {
  if (!secret.startsWith('sk-relay-')) throw new AppError('unauthorized')
  const prefix = secret.slice(0, 16)
  const candidates = await db.select().from(apiKeys).where(and(eq(apiKeys.prefix, prefix), eq(apiKeys.state, 'active')))
  for (const c of candidates) {
    if (await bcrypt.compare(secret, c.secretHash)) {
      return c
    }
  }
  throw new AppError('unauthorized')
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/ && git commit -m "feat(services): api_keys"
```

---

### Task 14: 控制台 API keys 路由

**Files:**
- Create: `backend/src/routes/console/keys.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: 路由**

```ts
// backend/src/routes/console/keys.ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { createKey, listKeys, revokeKey, toPublicKey } from '../../services/api-keys.js'

export const keysRoutes = new Hono()
keysRoutes.use('*', requireBearer)

keysRoutes.get('/', async (c) => {
  const rows = await listKeys(c.get('user').id)
  return c.json({ keys: rows.map(toPublicKey) })
})

keysRoutes.post('/', zValidator('json', z.object({ name: z.string().min(1) })), async (c) => {
  const { name } = c.req.valid('json')
  const { row, secret } = await createKey(c.get('user').id, name)
  return c.json({ ...toPublicKey(row), secret }, 201)
})

keysRoutes.post('/:id/revoke', async (c) => {
  const row = await revokeKey(c.get('user').id, c.req.param('id'))
  return c.json(toPublicKey(row))
})
```

- [ ] **Step 2: 挂路由（app.ts）**

```ts
// 在 app.route('/api/console', authRoutes) 之后加：
import { keysRoutes } from './routes/console/keys.js'
app.route('/api/console/keys', keysRoutes)
```

- [ ] **Step 3: 集成测试**

```ts
// backend/src/routes/console/keys.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../../app.js'
import { pool } from '../../db/client.js'

const app = createApp()
let token = ''

beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email='keys-test@example.com'")
  const r = await app.fetch(new Request('http://x/api/console/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'keys-test@example.com', password: 'secret123' }),
  }))
  token = (await r.json()).session.token
})
afterAll(async () => { await pool.end() })

async function req(path: string, init: RequestInit = {}) {
  return app.fetch(new Request('http://x' + path, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  }))
}

describe('keys routes', () => {
  it('creates then lists then revokes', async () => {
    const c = await req('/api/console/keys', { method: 'POST', body: JSON.stringify({ name: 'k1' }) })
    expect(c.status).toBe(201)
    const cj = await c.json()
    expect(cj.secret).toMatch(/^sk-relay-/)
    expect(cj.prefix).toBe(cj.secret.slice(0, 16))

    const l = await req('/api/console/keys')
    const lj = await l.json()
    expect(lj.keys.some((k: any) => k.id === cj.id && k.secret === undefined)).toBe(true)

    const r = await req(`/api/console/keys/${cj.id}/revoke`, { method: 'POST' })
    expect((await r.json()).state).toBe('revoked')
  })
})
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && npx vitest run src/routes/console/keys.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/ && git commit -m "feat(console): api keys crud"
```

---

## Milestone 3 — 上游池

### Task 15: KMS 加密工具（AES-256-GCM）

**Files:**
- Create: `backend/src/crypto/kms.ts`
- Create: `backend/src/crypto/kms.test.ts`

- [ ] **Step 1: 失败测试**

```ts
// backend/src/crypto/kms.test.ts
import { describe, it, expect } from 'vitest'
import { encryptSecret, decryptSecret } from './kms.js'

const KEY = 'a'.repeat(64)

describe('kms', () => {
  it('roundtrips', () => {
    const ct = encryptSecret('sk-ant-api03-XYZ', KEY)
    expect(ct).not.toContain('sk-ant')
    expect(decryptSecret(ct, KEY)).toBe('sk-ant-api03-XYZ')
  })

  it('fails with wrong key', () => {
    const ct = encryptSecret('secret', KEY)
    expect(() => decryptSecret(ct, 'b'.repeat(64))).toThrow()
  })
})
```

- [ ] **Step 2: 跑失败**

Run: `cd backend && npx vitest run src/crypto/kms.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
// backend/src/crypto/kms.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// key: 64 hex chars (32 bytes). returns base64(iv || tag || ciphertext).
export function encryptSecret(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) throw new Error('KMS key must be 32 bytes (64 hex chars)')
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([c.update(plaintext, 'utf8'), c.final()])
  const tag = c.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptSecret(packed: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const buf = Buffer.from(packed, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const d = createDecipheriv('aes-256-gcm', key, iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8')
}
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && npx vitest run src/crypto/kms.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/src/crypto/kms* && git commit -m "feat(crypto): AES-256-GCM kms"
```

---

### Task 16: upstream_keys 表 + service

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/src/services/upstream-keys.ts`

- [ ] **Step 1: 加表**

```ts
// 追加到 schema.ts
export const upstreamKeys = pgTable('upstream_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  alias: text('alias').notNull(),
  provider: text('provider').notNull().default('anthropic_official'),
  keyCiphertext: text('key_ciphertext').notNull(),   // base64
  keyPrefix: text('key_prefix').notNull(),
  state: text('state').notNull().default('active'),  // 'active' | 'cooldown' | 'disabled'
  priority: numeric('priority').notNull().default('100'),
  cooldownUntil: timestamp('cooldown_until', { withTimezone: true }),
  lastErrorCode: text('last_error_code'),
  lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
  quotaHintUsd: numeric('quota_hint_usd', { precision: 12, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 2: 迁移**

Run: `cd backend && npm run db:generate && npm run db:migrate`

- [ ] **Step 3: service**

```ts
// backend/src/services/upstream-keys.ts
import { eq, and, asc, desc, or, lt, isNull } from 'drizzle-orm'
import { db } from '../db/client.js'
import { upstreamKeys } from '../db/schema.js'
import { encryptSecret, decryptSecret } from '../crypto/kms.js'
import { env } from '../env.js'
import { AppError } from '../shared/errors.js'

export type UpstreamRow = typeof upstreamKeys.$inferSelect
export type UpstreamPublic = Omit<UpstreamRow, 'keyCiphertext'>

export function toPublic(row: UpstreamRow): UpstreamPublic {
  const { keyCiphertext: _omit, ...rest } = row
  return rest
}

export async function create(input: { alias: string; secret: string; priority?: number; quotaHintUsd?: string }) {
  const ct = encryptSecret(input.secret, env.UPSTREAM_KEY_KMS)
  const prefix = input.secret.slice(0, 20)
  const [row] = await db.insert(upstreamKeys).values({
    alias: input.alias,
    keyCiphertext: ct,
    keyPrefix: prefix,
    priority: String(input.priority ?? 100),
    quotaHintUsd: input.quotaHintUsd,
  }).returning()
  return row!
}

export async function list() {
  return db.select().from(upstreamKeys).orderBy(asc(upstreamKeys.priority), desc(upstreamKeys.createdAt))
}

export async function patch(id: string, p: { alias?: string; state?: 'active' | 'cooldown' | 'disabled'; priority?: number }) {
  const [row] = await db.update(upstreamKeys).set({
    ...(p.alias !== undefined ? { alias: p.alias } : {}),
    ...(p.state !== undefined ? { state: p.state } : {}),
    ...(p.priority !== undefined ? { priority: String(p.priority) } : {}),
  }).where(eq(upstreamKeys.id, id)).returning()
  if (!row) throw new AppError('not_found')
  return row
}

export async function remove(id: string) {
  await db.delete(upstreamKeys).where(eq(upstreamKeys.id, id))
}

export async function decrypt(row: UpstreamRow): Promise<string> {
  return decryptSecret(row.keyCiphertext, env.UPSTREAM_KEY_KMS)
}

export async function markCooldown(id: string, ms: number, errorCode: string) {
  const until = new Date(Date.now() + ms)
  await db.update(upstreamKeys).set({
    state: 'cooldown',
    cooldownUntil: until,
    lastErrorCode: errorCode,
    lastErrorAt: new Date(),
  }).where(eq(upstreamKeys.id, id))
}

export async function reactivateExpired() {
  await db.update(upstreamKeys)
    .set({ state: 'active', cooldownUntil: null })
    .where(and(eq(upstreamKeys.state, 'cooldown'), lt(upstreamKeys.cooldownUntil, new Date())))
}

export async function pickActive(): Promise<UpstreamRow[]> {
  await reactivateExpired()
  return db.select().from(upstreamKeys)
    .where(eq(upstreamKeys.state, 'active'))
    .orderBy(asc(upstreamKeys.priority), asc(upstreamKeys.createdAt))
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/ && git commit -m "feat(services): upstream_keys"
```

---

### Task 17: admin 中间件 + upstream-keys 路由

**Files:**
- Create: `backend/src/middleware/auth-admin.ts`
- Create: `backend/src/routes/admin/upstream-keys.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: admin middleware**

```ts
// backend/src/middleware/auth-admin.ts
import type { MiddlewareHandler } from 'hono'
import { AppError } from '../shared/errors.js'

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const u = c.get('user')
  if (!u || u.role !== 'admin') throw new AppError('forbidden')
  await next()
}
```

- [ ] **Step 2: 路由**

```ts
// backend/src/routes/admin/upstream-keys.ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import * as svc from '../../services/upstream-keys.js'

export const upstreamKeysRoutes = new Hono()
upstreamKeysRoutes.use('*', requireBearer, requireAdmin)

upstreamKeysRoutes.get('/', async (c) => {
  const rows = await svc.list()
  return c.json({ upstream_keys: rows.map(svc.toPublic) })
})

upstreamKeysRoutes.post('/', zValidator('json', z.object({
  alias: z.string().min(1),
  secret: z.string().min(10),
  priority: z.number().int().optional(),
  quota_hint_usd: z.string().optional(),
})), async (c) => {
  const b = c.req.valid('json')
  const row = await svc.create({ alias: b.alias, secret: b.secret, priority: b.priority, quotaHintUsd: b.quota_hint_usd })
  return c.json(svc.toPublic(row), 201)
})

upstreamKeysRoutes.patch('/:id', zValidator('json', z.object({
  alias: z.string().optional(),
  state: z.enum(['active', 'cooldown', 'disabled']).optional(),
  priority: z.number().int().optional(),
})), async (c) => {
  const row = await svc.patch(c.req.param('id'), c.req.valid('json'))
  return c.json(svc.toPublic(row))
})

upstreamKeysRoutes.delete('/:id', async (c) => {
  await svc.remove(c.req.param('id'))
  return c.json({ ok: true })
})
```

- [ ] **Step 3: 挂到 app**

```ts
import { upstreamKeysRoutes } from './routes/admin/upstream-keys.js'
app.route('/api/admin/upstream-keys', upstreamKeysRoutes)
```

- [ ] **Step 4: Commit**

```bash
git add backend/ && git commit -m "feat(admin): upstream-keys crud"
```

---

### Task 18: UpstreamScheduler（pick + 冷却）

**Files:**
- Create: `backend/src/gateway/scheduler.ts`
- Create: `backend/src/gateway/scheduler.test.ts`

- [ ] **Step 1: 失败测试**

```ts
// backend/src/gateway/scheduler.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { pool, db } from '../db/client.js'
import { upstreamKeys } from '../db/schema.js'
import { UpstreamScheduler } from './scheduler.js'
import * as svc from '../services/upstream-keys.js'

describe('UpstreamScheduler', () => {
  beforeEach(async () => { await db.delete(upstreamKeys) })

  it('picks active keys by priority asc', async () => {
    await svc.create({ alias: 'b', secret: 'sk-ant-api03-BBBBBBBB', priority: 200 })
    await svc.create({ alias: 'a', secret: 'sk-ant-api03-AAAAAAAA', priority: 100 })
    const s = new UpstreamScheduler()
    const list = await s.snapshot()
    expect(list[0]!.alias).toBe('a')
  })

  it('cooldown removes from active pool', async () => {
    const a = await svc.create({ alias: 'a', secret: 'sk-ant-api03-AAAAAAAA', priority: 100 })
    const s = new UpstreamScheduler()
    await s.cooldown(a.id, 60_000, 'rate_limit_429')
    const list = await s.snapshot()
    expect(list).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑失败**

Run: `cd backend && npx vitest run src/gateway/scheduler.test.ts`
Expected: FAIL（scheduler 未定义）。

- [ ] **Step 3: 实现**

```ts
// backend/src/gateway/scheduler.ts
import * as svc from '../services/upstream-keys.js'
import type { UpstreamRow } from '../services/upstream-keys.js'

export class UpstreamScheduler {
  async snapshot(): Promise<UpstreamRow[]> {
    return svc.pickActive()
  }

  async cooldown(id: string, ms: number, errorCode: string) {
    await svc.markCooldown(id, ms, errorCode)
  }

  async decrypt(row: UpstreamRow): Promise<string> {
    return svc.decrypt(row)
  }
}

export const scheduler = new UpstreamScheduler()
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && npx vitest run src/gateway/scheduler.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/ && git commit -m "feat(gateway): UpstreamScheduler"
```

---

### Task 19: models 表 + sync + 列表路由

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/src/services/models.ts`
- Create: `backend/src/routes/admin/models.ts`
- Create: `backend/src/routes/v1/models.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: 加表**

```ts
export const models = pgTable('models', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  contextWindow: numeric('context_window').notNull().default('200000'),
  inputPriceUsdPerMtok: numeric('input_price_usd_per_mtok', { precision: 12, scale: 4 }).notNull().default('0'),
  outputPriceUsdPerMtok: numeric('output_price_usd_per_mtok', { precision: 12, scale: 4 }).notNull().default('0'),
  cacheReadPriceUsdPerMtok: numeric('cache_read_price_usd_per_mtok', { precision: 12, scale: 4 }),
  cacheWritePriceUsdPerMtok: numeric('cache_write_price_usd_per_mtok', { precision: 12, scale: 4 }),
  markupPct: numeric('markup_pct', { precision: 6, scale: 4 }).notNull().default('0'),
  enabled: boolean('enabled').notNull().default(true),
  recommended: boolean('recommended').notNull().default(false),
  note: text('note').notNull().default(''),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 2: 迁移**

```bash
cd backend && npm run db:generate && npm run db:migrate
```

- [ ] **Step 3: models service**

```ts
// backend/src/services/models.ts
import { eq } from 'drizzle-orm'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '../db/client.js'
import { models } from '../db/schema.js'
import { env } from '../env.js'
import { AppError } from '../shared/errors.js'

export type ModelRow = typeof models.$inferSelect

export async function list({ enabledOnly }: { enabledOnly: boolean }) {
  const rows = await db.select().from(models)
  return enabledOnly ? rows.filter((r) => r.enabled) : rows
}

export async function getById(id: string) {
  const row = await db.query.models.findFirst({ where: eq(models.id, id) })
  if (!row) throw new AppError('unknown_model')
  return row
}

export async function patch(id: string, p: Partial<Pick<ModelRow, 'displayName' | 'markupPct' | 'enabled' | 'recommended' | 'note'>>) {
  const [row] = await db.update(models).set(p).where(eq(models.id, id)).returning()
  if (!row) throw new AppError('not_found')
  return row
}

export async function sync(upstreamApiKey: string): Promise<{ added: string[]; updated: string[] }> {
  const client = new Anthropic({ apiKey: upstreamApiKey, baseURL: env.ANTHROPIC_UPSTREAM_BASE_URL })
  const res = await client.models.list({ limit: 100 })
  const added: string[] = []
  const updated: string[] = []
  for (const m of res.data) {
    const existing = await db.query.models.findFirst({ where: eq(models.id, m.id) })
    if (!existing) {
      await db.insert(models).values({
        id: m.id,
        displayName: m.display_name ?? m.id,
        syncedAt: new Date(),
      })
      added.push(m.id)
    } else {
      await db.update(models).set({ syncedAt: new Date(), displayName: existing.displayName }).where(eq(models.id, m.id))
      updated.push(m.id)
    }
  }
  return { added, updated }
}
```

> 注意：价格 `input_price_usd_per_mtok` / `output_price_usd_per_mtok` 目前 Anthropic 的 `models.list` 不返回，admin 必须通过后续 `PATCH` 手填。`sync` 只负责发现模型 ID 和 display name。

- [ ] **Step 4: admin models 路由**

```ts
// backend/src/routes/admin/models.ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import { AppError } from '../../shared/errors.js'
import * as svc from '../../services/models.js'
import * as upstream from '../../services/upstream-keys.js'

export const adminModelsRoutes = new Hono()
adminModelsRoutes.use('*', requireBearer, requireAdmin)

adminModelsRoutes.get('/', async (c) => c.json({ models: await svc.list({ enabledOnly: false }) }))

adminModelsRoutes.post('/', () => { throw new AppError('method_not_allowed', 'use /sync to import from upstream') })

adminModelsRoutes.post('/sync', async (c) => {
  const active = await upstream.pickActive()
  if (active.length === 0) throw new AppError('all_upstreams_down', 'no active upstream key to perform sync')
  const apiKey = await upstream.decrypt(active[0]!)
  const result = await svc.sync(apiKey)
  return c.json(result)
})

adminModelsRoutes.patch('/:id', zValidator('json', z.object({
  display_name: z.string().optional(),
  markup_pct: z.string().optional(),
  enabled: z.boolean().optional(),
  recommended: z.boolean().optional(),
  note: z.string().optional(),
  input_price_usd_per_mtok: z.string().optional(),
  output_price_usd_per_mtok: z.string().optional(),
  cache_read_price_usd_per_mtok: z.string().optional(),
  cache_write_price_usd_per_mtok: z.string().optional(),
})), async (c) => {
  const b = c.req.valid('json')
  const patch: any = {}
  if (b.display_name !== undefined) patch.displayName = b.display_name
  if (b.markup_pct !== undefined) patch.markupPct = b.markup_pct
  if (b.enabled !== undefined) patch.enabled = b.enabled
  if (b.recommended !== undefined) patch.recommended = b.recommended
  if (b.note !== undefined) patch.note = b.note
  if (b.input_price_usd_per_mtok !== undefined) patch.inputPriceUsdPerMtok = b.input_price_usd_per_mtok
  if (b.output_price_usd_per_mtok !== undefined) patch.outputPriceUsdPerMtok = b.output_price_usd_per_mtok
  if (b.cache_read_price_usd_per_mtok !== undefined) patch.cacheReadPriceUsdPerMtok = b.cache_read_price_usd_per_mtok
  if (b.cache_write_price_usd_per_mtok !== undefined) patch.cacheWritePriceUsdPerMtok = b.cache_write_price_usd_per_mtok
  const row = await svc.patch(c.req.param('id'), patch)
  return c.json(row)
})
```

- [ ] **Step 5: `/v1/models` 公开给 SDK**

```ts
// backend/src/routes/v1/models.ts
import { Hono } from 'hono'
import * as svc from '../../services/models.js'

export const v1Models = new Hono()

v1Models.get('/', async (c) => {
  const rows = await svc.list({ enabledOnly: true })
  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      display_name: r.displayName,
      type: 'model',
      created_at: r.syncedAt.toISOString(),
    })),
    has_more: false,
    first_id: rows[0]?.id ?? null,
    last_id: rows[rows.length - 1]?.id ?? null,
  })
})
```

- [ ] **Step 6: 挂路由**

```ts
import { adminModelsRoutes } from './routes/admin/models.js'
import { v1Models } from './routes/v1/models.js'
app.route('/api/admin/models', adminModelsRoutes)
app.route('/v1/models', v1Models)
```

- [ ] **Step 7: Commit**

```bash
git add backend/ && git commit -m "feat(models): sync + admin crud + /v1/models"
```

---

## Milestone 4 — 网关非流式

### Task 20: canonicalize + sha256

**Files:**
- Create: `backend/src/shared/canonicalize.ts`
- Create: `backend/src/shared/canonicalize.test.ts`

- [ ] **Step 1: 失败测试**

```ts
// backend/src/shared/canonicalize.test.ts
import { describe, it, expect } from 'vitest'
import { canonicalize, hashBody } from './canonicalize.js'

describe('canonicalize', () => {
  it('sorts keys and drops null/undefined', () => {
    const a = canonicalize({ b: 2, a: 1, c: null, d: undefined })
    expect(a).toBe('{"a":1,"b":2}')
  })

  it('same semantics → same hash regardless of key order', () => {
    const h1 = hashBody({ model: 'x', messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 })
    const h2 = hashBody({ max_tokens: 10, messages: [{ content: 'hi', role: 'user' }], model: 'x' })
    expect(h1).toBe(h2)
  })

  it('different messages → different hash', () => {
    const h1 = hashBody({ model: 'x', messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 })
    const h2 = hashBody({ model: 'x', messages: [{ role: 'user', content: 'hello' }], max_tokens: 10 })
    expect(h1).not.toBe(h2)
  })
})
```

- [ ] **Step 2: 跑失败**

Run: `cd backend && npx vitest run src/shared/canonicalize.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
// backend/src/shared/canonicalize.ts
import { createHash } from 'node:crypto'

export function canonicalize(v: unknown): string {
  return JSON.stringify(sort(v))
}

function sort(v: unknown): unknown {
  if (v === null || v === undefined) return undefined
  if (Array.isArray(v)) return v.map(sort).filter((x) => x !== undefined)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(o).sort()) {
      const s = sort(o[k])
      if (s !== undefined) out[k] = s
    }
    return out
  }
  if (typeof v === 'string') return v.normalize('NFC')
  return v
}

export function hashBody(v: unknown): string {
  return createHash('sha256').update(canonicalize(v)).digest('hex')
}
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && npx vitest run src/shared/canonicalize.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/src/shared/canonicalize* && git commit -m "feat(shared): canonicalize + hashBody"
```

---

### Task 21: Meter（token → cost）

**Files:**
- Create: `backend/src/gateway/meter.ts`
- Create: `backend/src/gateway/meter.test.ts`

- [ ] **Step 1: 失败测试**

```ts
// backend/src/gateway/meter.test.ts
import { describe, it, expect } from 'vitest'
import { computeCost } from './meter.js'

describe('meter', () => {
  it('base cost with no markup', () => {
    const c = computeCost({
      inputTokens: 1_000_000, outputTokens: 1_000_000,
      cacheReadTokens: 0, cacheWriteTokens: 0,
      model: {
        inputPriceUsdPerMtok: '3', outputPriceUsdPerMtok: '15',
        cacheReadPriceUsdPerMtok: null, cacheWritePriceUsdPerMtok: null,
        markupPct: '0',
      },
    })
    expect(c.costUsd).toBe('18.000000')
    expect(c.chargeUsd).toBe('18.000000')
  })

  it('applies markup', () => {
    const c = computeCost({
      inputTokens: 1_000_000, outputTokens: 0,
      cacheReadTokens: 0, cacheWriteTokens: 0,
      model: {
        inputPriceUsdPerMtok: '3', outputPriceUsdPerMtok: '15',
        cacheReadPriceUsdPerMtok: null, cacheWritePriceUsdPerMtok: null,
        markupPct: '0.2',
      },
    })
    expect(c.costUsd).toBe('3.000000')
    expect(c.chargeUsd).toBe('3.600000')
  })
})
```

- [ ] **Step 2: 跑失败**

Run: `cd backend && npx vitest run src/gateway/meter.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
// backend/src/gateway/meter.ts
export type ModelPricing = {
  inputPriceUsdPerMtok: string
  outputPriceUsdPerMtok: string
  cacheReadPriceUsdPerMtok: string | null
  cacheWritePriceUsdPerMtok: string | null
  markupPct: string
}

export type UsageInput = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  model: ModelPricing
}

function mul(tokens: number, pricePerMtok: string | null): number {
  if (!pricePerMtok) return 0
  return (tokens / 1_000_000) * Number(pricePerMtok)
}

function fmt(n: number): string {
  return n.toFixed(6)
}

export function computeCost(u: UsageInput): { costUsd: string; chargeUsd: string } {
  const cost =
    mul(u.inputTokens, u.model.inputPriceUsdPerMtok) +
    mul(u.outputTokens, u.model.outputPriceUsdPerMtok) +
    mul(u.cacheReadTokens, u.model.cacheReadPriceUsdPerMtok) +
    mul(u.cacheWriteTokens, u.model.cacheWritePriceUsdPerMtok)
  const charge = cost * (1 + Number(u.model.markupPct))
  return { costUsd: fmt(cost), chargeUsd: fmt(charge) }
}
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && npx vitest run src/gateway/meter.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/src/gateway/meter* && git commit -m "feat(gateway): meter (tokens to cost)"
```

---

### Task 22: request_logs + billing_ledger 表

**Files:**
- Modify: `backend/src/db/schema.ts`

- [ ] **Step 1: 加表**

```ts
export const requestLogs = pgTable('request_logs', {
  id: text('id').primaryKey(),                          // 'req_' + ulid
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  apiKeyId: uuid('api_key_id').notNull().references(() => apiKeys.id, { onDelete: 'set null' }),
  upstreamKeyId: uuid('upstream_key_id').references(() => upstreamKeys.id, { onDelete: 'set null' }),
  model: text('model').notNull(),
  upstreamModel: text('upstream_model').notNull(),
  endpoint: text('endpoint').notNull(),
  stream: boolean('stream').notNull().default(false),
  status: numeric('status').notNull(),
  errorCode: text('error_code'),
  latencyMs: numeric('latency_ms').notNull().default('0'),
  ttfbMs: numeric('ttfb_ms'),
  inputTokens: numeric('input_tokens').notNull().default('0'),
  outputTokens: numeric('output_tokens').notNull().default('0'),
  cacheReadTokens: numeric('cache_read_tokens').notNull().default('0'),
  cacheWriteTokens: numeric('cache_write_tokens').notNull().default('0'),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
  requestHash: text('request_hash').notNull(),
  upstreamRequestHash: text('upstream_request_hash').notNull(),
  auditMatch: boolean('audit_match').notNull(),
  idempotencyKey: text('idempotency_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const billingLedger = pgTable('billing_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  requestLogId: text('request_log_id').references(() => requestLogs.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),                         // debit_usage | credit_signup | credit_admin_adjust
  amountUsd: numeric('amount_usd', { precision: 12, scale: 6 }).notNull(),
  balanceAfterUsd: numeric('balance_after_usd', { precision: 12, scale: 6 }).notNull(),
  note: text('note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 2: 迁移**

```bash
cd backend && npm run db:generate && npm run db:migrate
```

- [ ] **Step 3: Commit**

```bash
git add backend/ && git commit -m "feat(db): request_logs + billing_ledger"
```

---

### Task 23: Biller（事务扣费 + 写日志）

**Files:**
- Create: `backend/src/gateway/biller.ts`
- Create: `backend/src/gateway/biller.test.ts`

- [ ] **Step 1: 失败测试**

```ts
// backend/src/gateway/biller.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db, pool } from '../db/client.js'
import { users, apiKeys } from '../db/schema.js'
import { commitRequest } from './biller.js'
import { eq } from 'drizzle-orm'

describe('commitRequest', () => {
  let userId: string
  let apiKeyId: string

  beforeEach(async () => {
    await pool.query("DELETE FROM users WHERE email='biller-test@example.com'")
    const [u] = await db.insert(users).values({
      email: 'biller-test@example.com',
      passwordHash: 'x', name: 't', balanceUsd: '10.000000',
    }).returning()
    userId = u!.id
    const [k] = await db.insert(apiKeys).values({
      userId, name: 'k', prefix: 'sk-relay-XXXXXXX', secretHash: 'x',
    }).returning()
    apiKeyId = k!.id
  })

  it('debits balance and writes log + ledger', async () => {
    await commitRequest({
      id: 'req_01',
      userId, apiKeyId, upstreamKeyId: null,
      model: 'claude-opus-4-7', upstreamModel: 'claude-opus-4-7',
      endpoint: '/v1/messages', stream: false, status: 200,
      errorCode: null, latencyMs: 421, ttfbMs: null,
      inputTokens: 100, outputTokens: 200,
      cacheReadTokens: 0, cacheWriteTokens: 0,
      chargeUsd: '0.500000', costUsd: '0.500000',
      requestHash: 'a', upstreamRequestHash: 'a', auditMatch: true,
      idempotencyKey: null,
    })
    const [u] = await db.select().from(users).where(eq(users.id, userId))
    expect(u!.balanceUsd).toBe('9.500000')
  })
})
```

- [ ] **Step 2: 跑失败**

Run: `cd backend && npx vitest run src/gateway/biller.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
// backend/src/gateway/biller.ts
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users, requestLogs, billingLedger } from '../db/schema.js'

export type CommitInput = {
  id: string
  userId: string
  apiKeyId: string
  upstreamKeyId: string | null
  model: string
  upstreamModel: string
  endpoint: string
  stream: boolean
  status: number
  errorCode: string | null
  latencyMs: number
  ttfbMs: number | null
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  chargeUsd: string
  costUsd: string
  requestHash: string
  upstreamRequestHash: string
  auditMatch: boolean
  idempotencyKey: string | null
}

export async function commitRequest(input: CommitInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(requestLogs).values({
      id: input.id,
      userId: input.userId,
      apiKeyId: input.apiKeyId,
      upstreamKeyId: input.upstreamKeyId,
      model: input.model,
      upstreamModel: input.upstreamModel,
      endpoint: input.endpoint,
      stream: input.stream,
      status: String(input.status),
      errorCode: input.errorCode,
      latencyMs: String(input.latencyMs),
      ttfbMs: input.ttfbMs !== null ? String(input.ttfbMs) : null,
      inputTokens: String(input.inputTokens),
      outputTokens: String(input.outputTokens),
      cacheReadTokens: String(input.cacheReadTokens),
      cacheWriteTokens: String(input.cacheWriteTokens),
      costUsd: input.costUsd,
      requestHash: input.requestHash,
      upstreamRequestHash: input.upstreamRequestHash,
      auditMatch: input.auditMatch,
      idempotencyKey: input.idempotencyKey,
    })

    if (Number(input.chargeUsd) > 0) {
      const [u] = await tx.update(users)
        .set({ balanceUsd: sql`${users.balanceUsd} - ${input.chargeUsd}`, updatedAt: new Date() })
        .where(eq(users.id, input.userId))
        .returning({ balanceUsd: users.balanceUsd })

      await tx.insert(billingLedger).values({
        userId: input.userId,
        requestLogId: input.id,
        kind: 'debit_usage',
        amountUsd: '-' + input.chargeUsd,
        balanceAfterUsd: u!.balanceUsd,
        note: `${input.model} ${input.inputTokens}+${input.outputTokens}t`,
      })
    }
  })
}
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && npx vitest run src/gateway/biller.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/ && git commit -m "feat(gateway): Biller (transactional commit)"
```

---

### Task 24: API key 鉴权中间件

**Files:**
- Create: `backend/src/middleware/auth-api-key.ts`

- [ ] **Step 1: 实现**

```ts
// backend/src/middleware/auth-api-key.ts
import type { MiddlewareHandler } from 'hono'
import { AppError } from '../shared/errors.js'
import { resolveKey } from '../services/api-keys.js'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import type { ApiKeyRow } from '../services/api-keys.js'
import type { UserRow } from '../services/users.js'

declare module 'hono' {
  interface ContextVariableMap {
    apiKey: ApiKeyRow
  }
}

function extractSecret(c: any): string | null {
  const xApi = c.req.header('x-api-key')
  if (xApi) return xApi.trim()
  const auth = c.req.header('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  return m ? m[1]!.trim() : null
}

export const requireApiKey: MiddlewareHandler = async (c, next) => {
  const secret = extractSecret(c)
  if (!secret || !secret.startsWith('sk-relay-')) throw new AppError('unauthorized')
  const key = await resolveKey(secret)
  const user = await db.query.users.findFirst({ where: eq(users.id, key.userId) })
  if (!user) throw new AppError('unauthorized')
  if (user.status === 'suspended') throw new AppError('account_suspended')
  if (Number(user.balanceUsd) <= 0) throw new AppError('insufficient_balance')
  c.set('apiKey', key)
  c.set('user', user as UserRow)
  await next()
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/middleware/auth-api-key.ts && git commit -m "feat(middleware): api-key auth"
```

---

### Task 25: 非流式 proxy

**Files:**
- Create: `backend/src/gateway/proxy.ts`

- [ ] **Step 1: 实现**

```ts
// backend/src/gateway/proxy.ts
import { env } from '../env.js'
import { scheduler } from './scheduler.js'
import { AppError } from '../shared/errors.js'
import type { UpstreamRow } from '../services/upstream-keys.js'

export type ProxyAttempt = {
  upstream: UpstreamRow
  response: Response
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

export async function forwardNonStream(
  path: string,
  headers: Record<string, string>,
  body: string,
): Promise<ProxyAttempt> {
  const pool = await scheduler.snapshot()
  if (pool.length === 0) throw new AppError('all_upstreams_down')

  const tried: { id: string; status: number | 'network' }[] = []
  for (let i = 0; i < Math.min(pool.length, 3); i++) {
    const upstream = pool[i]!
    const apiKey = await scheduler.decrypt(upstream)
    const url = new URL(path, env.ANTHROPIC_UPSTREAM_BASE_URL).toString()
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'x-api-key': apiKey,
          'anthropic-version': headers['anthropic-version'] ?? '2023-06-01',
          'content-type': 'application/json',
        },
        body,
      })
      if (RETRYABLE_STATUS.has(res.status)) {
        tried.push({ id: upstream.id, status: res.status })
        await scheduler.cooldown(upstream.id, res.status === 429 ? 60_000 : 300_000, `http_${res.status}`)
        continue
      }
      return { upstream, response: res }
    } catch (e) {
      tried.push({ id: upstream.id, status: 'network' })
      await scheduler.cooldown(upstream.id, 300_000, 'network_error')
      continue
    }
  }
  throw new AppError('all_upstreams_down', `tried ${JSON.stringify(tried)}`)
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/gateway/proxy.ts && git commit -m "feat(gateway): forwardNonStream with failover"
```

---

### Task 26: `POST /v1/messages`（非流式）

**Files:**
- Create: `backend/src/routes/v1/messages.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: 实现**

```ts
// backend/src/routes/v1/messages.ts
import { Hono } from 'hono'
import { ulid } from 'ulid'
import { requireApiKey } from '../../middleware/auth-api-key.js'
import { hashBody } from '../../shared/canonicalize.js'
import { getById as getModel } from '../../services/models.js'
import { forwardNonStream } from '../../gateway/proxy.js'
import { computeCost } from '../../gateway/meter.js'
import { commitRequest } from '../../gateway/biller.js'
import { AppError } from '../../shared/errors.js'

export const v1Messages = new Hono()

v1Messages.use('*', requireApiKey)

v1Messages.post('/', async (c) => {
  const started = Date.now()
  const user = c.get('user')
  const apiKey = c.get('apiKey')

  const rawBody = await c.req.text()
  let body: any
  try { body = JSON.parse(rawBody) } catch { throw new AppError('missing_fields', 'invalid json') }
  if (!body.model) throw new AppError('missing_fields', 'model required')
  if (!Array.isArray(body.messages)) throw new AppError('missing_fields', 'messages required')

  const model = await getModel(body.model)
  if (!model.enabled) throw new AppError('unknown_model', `${body.model} disabled`)
  if (body.stream === true) {
    return c.json({ error: 'not_implemented', message: 'streaming lands in Task 27' }, 501)
  }

  const requestHash = hashBody(body)
  const forwardBody = JSON.stringify(body)
  const upstreamRequestHash = hashBody(JSON.parse(forwardBody))

  const { upstream, response } = await forwardNonStream('/v1/messages', {
    'anthropic-version': c.req.header('anthropic-version') ?? '2023-06-01',
  }, forwardBody)

  const text = await response.text()
  let parsed: any = null
  try { parsed = JSON.parse(text) } catch {}
  const usage = parsed?.usage ?? {}

  const inputTokens = Number(usage.input_tokens ?? 0)
  const outputTokens = Number(usage.output_tokens ?? 0)
  const cacheReadTokens = Number(usage.cache_read_input_tokens ?? 0)
  const cacheWriteTokens = Number(usage.cache_creation_input_tokens ?? 0)

  const { costUsd, chargeUsd } = computeCost({
    inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
    model: {
      inputPriceUsdPerMtok: model.inputPriceUsdPerMtok,
      outputPriceUsdPerMtok: model.outputPriceUsdPerMtok,
      cacheReadPriceUsdPerMtok: model.cacheReadPriceUsdPerMtok,
      cacheWritePriceUsdPerMtok: model.cacheWritePriceUsdPerMtok,
      markupPct: model.markupPct,
    },
  })

  await commitRequest({
    id: 'req_' + ulid(),
    userId: user.id,
    apiKeyId: apiKey.id,
    upstreamKeyId: upstream.id,
    model: body.model,
    upstreamModel: parsed?.model ?? body.model,
    endpoint: '/v1/messages',
    stream: false,
    status: response.status,
    errorCode: response.status >= 400 ? `upstream_${response.status}` : null,
    latencyMs: Date.now() - started,
    ttfbMs: null,
    inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
    chargeUsd, costUsd,
    requestHash, upstreamRequestHash,
    auditMatch: requestHash === upstreamRequestHash,
    idempotencyKey: c.req.header('idempotency-key') ?? null,
  })

  return new Response(text, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  })
})
```

- [ ] **Step 2: 挂路由（app.ts）**

```ts
import { v1Messages } from './routes/v1/messages.js'
app.route('/v1/messages', v1Messages)
```

- [ ] **Step 3: 手工验证**（依赖真实 Anthropic Key，可选）

1. 启动：`cd backend && npm run dev`
2. admin 插一把 upstream key：`curl -X POST localhost:8080/api/admin/upstream-keys -H "authorization: Bearer <admin-session>" -H "content-type: application/json" -d '{"alias":"main","secret":"sk-ant-api03-真的"}'`
3. sync 模型 + 给 opus 打价格：`curl -X POST localhost:8080/api/admin/models/sync -H "authorization: Bearer <admin-session>"`
4. 用户建 key，用 `sk-relay-*` 打 `/v1/messages`。

- [ ] **Step 4: Commit**

```bash
git add backend/ && git commit -m "feat(v1): POST /v1/messages (non-stream)"
```

---

### Task 27: POST /v1/messages/count_tokens 透传

**Files:**
- Create: `backend/src/routes/v1/count-tokens.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: 实现**

```ts
// backend/src/routes/v1/count-tokens.ts
import { Hono } from 'hono'
import { requireApiKey } from '../../middleware/auth-api-key.js'
import { forwardNonStream } from '../../gateway/proxy.js'

export const v1CountTokens = new Hono()
v1CountTokens.use('*', requireApiKey)

v1CountTokens.post('/', async (c) => {
  const body = await c.req.text()
  const { response } = await forwardNonStream('/v1/messages/count_tokens', {
    'anthropic-version': c.req.header('anthropic-version') ?? '2023-06-01',
  }, body)
  const text = await response.text()
  return new Response(text, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  })
})
```

- [ ] **Step 2: 挂路由**

```ts
import { v1CountTokens } from './routes/v1/count-tokens.js'
app.route('/v1/messages/count_tokens', v1CountTokens)
```

- [ ] **Step 3: Commit**

```bash
git add backend/ && git commit -m "feat(v1): /v1/messages/count_tokens"
```

---

## Milestone 5 — 网关流式

### Task 28: SSE 帧解析 + usage 抽取

**Files:**
- Create: `backend/src/gateway/sse.ts`
- Create: `backend/src/gateway/sse.test.ts`

- [ ] **Step 1: 失败测试**

```ts
// backend/src/gateway/sse.test.ts
import { describe, it, expect } from 'vitest'
import { extractUsage } from './sse.js'

describe('extractUsage', () => {
  it('captures input from message_start and accumulates output from message_delta', () => {
    const u = extractUsage()
    u.observe('message_start', { message: { usage: { input_tokens: 42, cache_read_input_tokens: 5, cache_creation_input_tokens: 3 } } })
    u.observe('message_delta', { usage: { output_tokens: 10 } })
    u.observe('message_delta', { usage: { output_tokens: 25 } })
    expect(u.snapshot()).toEqual({
      inputTokens: 42, outputTokens: 25,
      cacheReadTokens: 5, cacheWriteTokens: 3,
    })
  })
})
```

- [ ] **Step 2: 跑失败**

Run: `cd backend && npx vitest run src/gateway/sse.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

```ts
// backend/src/gateway/sse.ts
export type Usage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export function extractUsage() {
  const u: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  return {
    observe(event: string, data: any) {
      if (event === 'message_start') {
        const m = data?.message?.usage
        if (m) {
          u.inputTokens = m.input_tokens ?? 0
          u.cacheReadTokens = m.cache_read_input_tokens ?? 0
          u.cacheWriteTokens = m.cache_creation_input_tokens ?? 0
        }
      } else if (event === 'message_delta') {
        const m = data?.usage
        if (m?.output_tokens !== undefined) u.outputTokens = m.output_tokens
      }
    },
    snapshot(): Usage { return { ...u } },
  }
}

// 把上游的 ReadableStream<Uint8Array> 切成 SSE 事件
export async function* iterSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: any; raw: string }> {
  const decoder = new TextDecoder()
  const reader = stream.getReader()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const chunk = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      let event = 'message'
      let data = ''
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data) continue
      let parsed: any = null
      try { parsed = JSON.parse(data) } catch {}
      yield { event, data: parsed, raw: chunk + '\n\n' }
    }
  }
}
```

- [ ] **Step 4: 跑测试**

Run: `cd backend && npx vitest run src/gateway/sse.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add backend/src/gateway/sse* && git commit -m "feat(gateway): SSE iterator + usage extractor"
```

---

### Task 29: 流式 proxy

**Files:**
- Modify: `backend/src/gateway/proxy.ts`

- [ ] **Step 1: 追加 `forwardStream` 函数**

```ts
// 追加到 backend/src/gateway/proxy.ts 末尾
export async function forwardStream(
  path: string,
  headers: Record<string, string>,
  body: string,
): Promise<ProxyAttempt> {
  const pool = await scheduler.snapshot()
  if (pool.length === 0) throw new AppError('all_upstreams_down')

  const tried: { id: string; status: number | 'network' }[] = []
  for (let i = 0; i < Math.min(pool.length, 3); i++) {
    const upstream = pool[i]!
    const apiKey = await scheduler.decrypt(upstream)
    const url = new URL(path, env.ANTHROPIC_UPSTREAM_BASE_URL).toString()
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'x-api-key': apiKey,
          'anthropic-version': headers['anthropic-version'] ?? '2023-06-01',
          'content-type': 'application/json',
          'accept': 'text/event-stream',
        },
        body,
      })
      // 流式只要 header 可接受就直接返，错误状态一样打冷却然后换下一把
      if (RETRYABLE_STATUS.has(res.status)) {
        tried.push({ id: upstream.id, status: res.status })
        await scheduler.cooldown(upstream.id, res.status === 429 ? 60_000 : 300_000, `http_${res.status}`)
        // drain body 防止连接泄漏
        try { await res.body?.cancel() } catch {}
        continue
      }
      return { upstream, response: res }
    } catch {
      tried.push({ id: upstream.id, status: 'network' })
      await scheduler.cooldown(upstream.id, 300_000, 'network_error')
      continue
    }
  }
  throw new AppError('all_upstreams_down', `tried ${JSON.stringify(tried)}`)
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/gateway/proxy.ts && git commit -m "feat(gateway): forwardStream"
```

---

### Task 30: `POST /v1/messages`（流式）

**Files:**
- Modify: `backend/src/routes/v1/messages.ts`

- [ ] **Step 1: 把 `stream=true` 的分支从 501 换成实现**

找到 Task 26 里这段：
```ts
if (body.stream === true) {
  return c.json({ error: 'not_implemented', message: 'streaming lands in Task 27' }, 501)
}
```

替换为：
```ts
if (body.stream === true) {
  return streamHandler(c, body, rawBody, started, user, apiKey)
}
```

并在同一文件顶部加 imports 与 `streamHandler` 函数：

```ts
import { stream } from 'hono/streaming'
import { forwardStream } from '../../gateway/proxy.js'
import { extractUsage, iterSSE } from '../../gateway/sse.js'

async function streamHandler(
  c: any, body: any, rawBody: string, started: number,
  user: any, apiKey: any,
) {
  const model = await getModel(body.model)
  if (!model.enabled) throw new AppError('unknown_model')

  const requestHash = hashBody(body)
  const forwardBody = rawBody
  const upstreamRequestHash = hashBody(JSON.parse(forwardBody))

  const { upstream, response } = await forwardStream('/v1/messages', {
    'anthropic-version': c.req.header('anthropic-version') ?? '2023-06-01',
  }, forwardBody)

  const id = 'req_' + ulid()
  const usage = extractUsage()
  let ttfbMs: number | null = null
  let upstreamModel = body.model

  c.header('content-type', response.headers.get('content-type') ?? 'text/event-stream')
  c.header('cache-control', 'no-cache')
  c.header('connection', 'keep-alive')
  c.status(response.status as 200)

  return stream(c, async (outStream) => {
    try {
      if (!response.body) {
        await outStream.write(new Uint8Array())
        return
      }
      for await (const ev of iterSSE(response.body)) {
        if (ttfbMs === null) ttfbMs = Date.now() - started
        usage.observe(ev.event, ev.data)
        if (ev.event === 'message_start' && ev.data?.message?.model) {
          upstreamModel = ev.data.message.model
        }
        await outStream.write(new TextEncoder().encode(ev.raw))
      }
    } finally {
      const snap = usage.snapshot()
      const { costUsd, chargeUsd } = computeCost({
        ...snap,
        model: {
          inputPriceUsdPerMtok: model.inputPriceUsdPerMtok,
          outputPriceUsdPerMtok: model.outputPriceUsdPerMtok,
          cacheReadPriceUsdPerMtok: model.cacheReadPriceUsdPerMtok,
          cacheWritePriceUsdPerMtok: model.cacheWritePriceUsdPerMtok,
          markupPct: model.markupPct,
        },
      })
      await commitRequest({
        id,
        userId: user.id,
        apiKeyId: apiKey.id,
        upstreamKeyId: upstream.id,
        model: body.model,
        upstreamModel,
        endpoint: '/v1/messages',
        stream: true,
        status: response.status,
        errorCode: response.status >= 400 ? `upstream_${response.status}` : null,
        latencyMs: Date.now() - started,
        ttfbMs,
        inputTokens: snap.inputTokens,
        outputTokens: snap.outputTokens,
        cacheReadTokens: snap.cacheReadTokens,
        cacheWriteTokens: snap.cacheWriteTokens,
        chargeUsd, costUsd,
        requestHash, upstreamRequestHash,
        auditMatch: requestHash === upstreamRequestHash,
        idempotencyKey: c.req.header('idempotency-key') ?? null,
      })
    }
  })
}
```

- [ ] **Step 2: 手工验证**（依赖真实 Key）

```bash
curl -N -X POST localhost:8080/v1/messages \
  -H "x-api-key: sk-relay-*" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":64,"stream":true,"messages":[{"role":"user","content":"数到五"}]}'
```

Expected: SSE 帧一条接一条输出，最终有 `message_stop`。

检查 DB：
```bash
docker compose exec postgres psql -U postgres -d claude_link -c "SELECT id, stream, status, input_tokens, output_tokens, cost_usd, audit_match FROM request_logs ORDER BY created_at DESC LIMIT 1"
```

Expected: `stream=t`，token 数非零，`audit_match=t`，`cost_usd` 非零。

- [ ] **Step 3: 客户端断开的集成测试**

```ts
// backend/src/routes/v1/messages.stream.test.ts
import { describe, it, expect } from 'vitest'
// 这个测试需要 mock 上游。MVP 里先用 msw 或简单的本地 http server 模拟一个 SSE 源。
// 如果时间不够，作为 open item 放到 Part 2 的集成测试阶段；本 task 完成标准仅是手工冒烟过。
it.todo('client disconnect → partial usage committed')
```

- [ ] **Step 4: Commit**

```bash
git add backend/ && git commit -m "feat(v1): POST /v1/messages streaming + usage metering"
```

---

### Task 31: Part 1 收尾 — 文档与集成冒烟

**Files:**
- Create: `backend/README.md`

- [ ] **Step 1: 写 backend README**

```markdown
# claude-link · Backend

Node.js + Hono 实现的 Claude 中转网关。Part 1 范围：鉴权 + 上游池 + `/v1/messages`（流式 + 非流式）+ 审计哈希 + 计费。

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
- `GET/POST/PATCH/DELETE /api/admin/upstream-keys`（需 admin）
- `POST /api/admin/models/sync` · `PATCH /api/admin/models/:id`
- `GET /v1/models` · `POST /v1/messages`（流 / 非流）· `POST /v1/messages/count_tokens`

## 跑测试

```bash
npm test
```

## Part 1 验收清单

- [x] 注册 / 登录 / session
- [x] API key 创建 / 列表 / 撤销（secret 只返回一次）
- [x] 上游 Key 池加解密存储 + 优先级调度 + 冷却
- [x] `/v1/messages` 非流式：审计哈希 + 扣费 + 失败切换
- [x] `/v1/messages` 流式：SSE 透传 + 增量 usage + 流结束计费
- [x] `/v1/models` · `/v1/messages/count_tokens`

Part 2 覆盖：Logs / Overview / Billing 查询接口、Playground、Redis 限流与幂等中间件、公开接口静态化、e2e 测试、部署脚本。
```

- [ ] **Step 2: 端到端冒烟脚本**

```bash
# 注册
curl -sX POST localhost:8080/api/console/register \
  -H 'content-type: application/json' \
  -d '{"email":"smoke@example.com","password":"secret123","name":"smoke"}' | jq .

# 用返回的 token 登录（或直接用 register 返回的 session.token）
TOKEN=<从上一步复制>

# 建一把 sk-relay
curl -sX POST localhost:8080/api/console/keys \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"smoke-key"}' | jq .
```

- [ ] **Step 3: 跑完整测试集**

Run: `cd backend && npm test`
Expected: 所有 PASS。

- [ ] **Step 4: Commit**

```bash
git add backend/README.md && git commit -m "docs(backend): Part 1 readme + smoke guide"
```

---

## Self-Review 清单

- **Spec coverage**:
  - 数据模型：users/sessions/api_keys/upstream_keys/models/request_logs/billing_ledger 全部落表 ✔️（`alerts` / `settings` / `audit_events` 留给 Part 2，spec 里 MVP 标注这些不影响核心链路）
  - 核心流程 §6.1 的 [1]-[9]：[1]-[6] + [8a] + [8b] + [9] 全部有任务对应
  - API 契约修正 §7：新增端点（`/v1/messages`、`count_tokens`、`/v1/models`、`/api/admin/upstream-keys`、`models/sync`）全部有 task；鉴权 header 双接受 ✔️；audit.match 语义重定义 ✔️
  - 安全 §10：密码 bcrypt ✔️；session/apiKey hash ✔️；上游 Key AES-256-GCM ✔️
  - Part 2 明确标注：Logs/Overview/Billing/Playground/限流幂等/公开接口/部署/e2e
- **Placeholder scan**：仅 Task 30 Step 3 有一条 `it.todo`（客户端断开测试），已在计划里说明延后到 Part 2 集成测试阶段，并给出手工冒烟替代方案——这不是 "TBD"，是有意识的延期
- **Type consistency**：`toPublicKey` / `toPublicUser` / `UpstreamScheduler` / `commitRequest` 的签名贯穿始终；`streamHandler` 用的 `getModel / hashBody / computeCost / commitRequest / forwardStream / iterSSE / extractUsage / ulid` 全部在前置 task 中定义过

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-27-claude-relay-part1-gateway-core.md`. Two execution options:

**1. Subagent-Driven（推荐）** — 每个 task 派一个独立 subagent 执行，中间做两阶段 review，迭代快、主上下文干净。

**2. Inline Execution** — 在当前会话里按 task 顺序执行，设 checkpoint 给你 review。

哪种？
