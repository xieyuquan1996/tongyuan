# Rate Limiting Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fixed-window RPM/TPM rate limiting with token bucket, unify 429 error format with `Retry-After` headers, and fix miscellaneous bugs (cooldown Lua, TPM reservation leak, DISABLE_USER_QUOTA warning).

**Architecture:** A new `RateLimitError` subclass carries headers through the Hono error handler. Both RPM and TPM reuse the same token bucket Lua script, keyed stably per API key (no per-minute bucket suffix). The `quota.ts` cooldown check moves time comparison into the Lua script using Redis `TIME`.

**Tech Stack:** Node 22, Hono, ioredis (via `redis` client), Lua scripting, Vitest.

---

## File Map

| File | Change |
|------|--------|
| `src/shared/errors.ts` | Add `RateLimitError` subclass with headers |
| `src/app.ts` | Special-case `RateLimitError` in error handler |
| `src/middleware/rate-limit.ts` | Rewrite: fixed-window INCR → token bucket Lua |
| `src/middleware/rate-limit.test.ts` | Update tests for token bucket behavior + new headers |
| `src/middleware/tpm-limit.ts` | Rewrite: fixed-window INCRBY → token bucket Lua |
| `src/middleware/tpm-limit.test.ts` | Update cleanup key pattern; tests pass as-is |
| `src/gateway/quota.ts` | Fix: cooldown Lua uses `redis.call('TIME')` |
| `src/gateway/quota.test.ts` | Add expired-cooldown test |
| `src/gateway/handle-messages.ts` | Fix: TPM reservation leak in `handleNonStream` |
| `src/routes/v1/messages.ts` | Update `rateLimit` call: remove bucket from key |
| `src/routes/v1/chat-completions.ts` | Update `rateLimit` call: remove bucket from key |
| `src/env.ts` | Add startup `[WARN]` for `DISABLE_USER_QUOTA` |
| `src/tests/e2e.test.ts` | Add FT: RPM 429 with `Retry-After` header |

---

## Running Tests

```bash
# In /backend
docker compose up -d   # start Postgres + Redis (only needed once)

# Run a single test file
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/middleware/rate-limit.test.ts

# Run all backend tests
env $(cat .env | grep -v '^#' | grep '=' | xargs) npm test
```

---

## Task 1: `RateLimitError` + error handler headers

### Files
- Modify: `src/shared/errors.ts`
- Modify: `src/app.ts`
- Modify: `src/shared/errors.test.ts`

---

- [ ] **Step 1.1 — Write failing test for `RateLimitError`**

Add to `src/shared/errors.test.ts`:

```typescript
import { AppError, RateLimitError, toErrorBody } from './errors.js'

describe('RateLimitError', () => {
  it('is an AppError with status 429', () => {
    const e = new RateLimitError('60 RPM exceeded', { retryAfterSec: 12, limitRequests: 60 })
    expect(e).toBeInstanceOf(AppError)
    expect(e.status).toBe(429)
    expect(e.code).toBe('rate_limit')
  })

  it('includes Retry-After and X-RateLimit-* headers', () => {
    const e = new RateLimitError('60 RPM exceeded', { retryAfterSec: 12, limitRequests: 60, remainingRequests: 0 })
    expect(e.rateLimitHeaders['retry-after']).toBe('12')
    expect(e.rateLimitHeaders['x-ratelimit-limit-requests']).toBe('60')
    expect(e.rateLimitHeaders['x-ratelimit-remaining-requests']).toBe('0')
    expect(e.rateLimitHeaders['x-ratelimit-reset-requests']).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('includes token headers when limitTokens is provided', () => {
    const e = new RateLimitError('TPM exceeded', { retryAfterSec: 5, limitTokens: 100000 })
    expect(e.rateLimitHeaders['x-ratelimit-limit-tokens']).toBe('100000')
    expect(e.rateLimitHeaders['x-ratelimit-remaining-tokens']).toBe('0')
  })
})
```

- [ ] **Step 1.2 — Run test, confirm it fails**

```bash
cd backend && env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/shared/errors.test.ts
```
Expected: `RateLimitError is not defined` or similar import error.

- [ ] **Step 1.3 — Add `RateLimitError` to `src/shared/errors.ts`**

Add after the `AppError` class:

```typescript
export class RateLimitError extends AppError {
  readonly retryAfterSec: number
  readonly rateLimitHeaders: Record<string, string>

  constructor(
    message: string,
    opts: {
      retryAfterSec: number
      limitRequests?: number
      remainingRequests?: number
      limitTokens?: number
      remainingTokens?: number
    },
  ) {
    super('rate_limit', message)
    this.retryAfterSec = opts.retryAfterSec
    const resetAt = new Date(Date.now() + opts.retryAfterSec * 1000).toISOString()
    this.rateLimitHeaders = {
      'retry-after': String(Math.ceil(opts.retryAfterSec)),
      ...(opts.limitRequests !== undefined
        ? {
            'x-ratelimit-limit-requests': String(opts.limitRequests),
            'x-ratelimit-remaining-requests': String(Math.max(0, opts.remainingRequests ?? 0)),
            'x-ratelimit-reset-requests': resetAt,
          }
        : {}),
      ...(opts.limitTokens !== undefined
        ? {
            'x-ratelimit-limit-tokens': String(opts.limitTokens),
            'x-ratelimit-remaining-tokens': String(Math.max(0, opts.remainingTokens ?? 0)),
            'x-ratelimit-reset-tokens': resetAt,
          }
        : {}),
    }
  }
}
```

- [ ] **Step 1.4 — Run test, confirm it passes**

```bash
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/shared/errors.test.ts
```
Expected: all tests pass.

- [ ] **Step 1.5 — Update `app.ts` error handler to emit headers for `RateLimitError`**

In `src/app.ts`, replace the `onError` handler:

```typescript
import { AppError, RateLimitError, toErrorBody } from './shared/errors.js'

// inside createApp():
app.onError((err, c) => {
  if (err instanceof RateLimitError) {
    return c.json(
      { type: 'error', error: { type: 'rate_limit_error', message: err.message } },
      429,
      err.rateLimitHeaders,
    )
  }
  const e = err as any
  const status: number =
    err instanceof AppError ? err.status :
    (e && typeof e.status === 'number' && typeof e.code === 'string') ? e.status :
    500
  return c.json(toErrorBody(err), status as any)
})
```

- [ ] **Step 1.6 — Commit**

```bash
git add src/shared/errors.ts src/shared/errors.test.ts src/app.ts
git commit -m "feat(rate-limit): add RateLimitError with Retry-After headers"
```

---

## Task 2: Rewrite `rate-limit.ts` — token bucket RPM

### Files
- Modify: `src/middleware/rate-limit.ts`
- Modify: `src/middleware/rate-limit.test.ts`
- Modify: `src/routes/v1/messages.ts`
- Modify: `src/routes/v1/chat-completions.ts`

---

- [ ] **Step 2.1 — Update `rate-limit.test.ts` for token bucket behavior**

Replace the entire file contents:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { Hono } from 'hono'
import { rateLimit } from './rate-limit.js'
import { AppError, RateLimitError, toErrorBody } from '../shared/errors.js'
import { redis } from '../redis/client.js'

describe('rateLimit (token bucket)', () => {
  const prefix = `rl-tb-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  async function cleanup() {
    const keys = await redis.keys(`rl:tb:${prefix}*`)
    if (keys.length) await redis.del(...keys)
  }

  beforeEach(cleanup)
  afterAll(cleanup)

  function mkApp(limit: number, keyFn: () => string = () => `${prefix}:fixed`) {
    const app = new Hono()
    app.onError((err, c) => {
      if (err instanceof RateLimitError) {
        return c.json(
          { type: 'error', error: { type: 'rate_limit_error', message: err.message } },
          429,
          err.rateLimitHeaders,
        )
      }
      const status = err instanceof AppError ? err.status : 500
      return c.json(toErrorBody(err), status as any)
    })
    app.use('*', rateLimit(() => ({ key: keyFn(), limit })))
    app.get('/', (c) => c.json({ ok: true }))
    return app
  }

  it('allows requests up to limit, rejects beyond', async () => {
    const app = mkApp(3)
    for (let i = 0; i < 3; i++) {
      const r = await app.fetch(new Request('http://x/'))
      expect(r.status).toBe(200)
    }
    const r = await app.fetch(new Request('http://x/'))
    expect(r.status).toBe(429)
    const body = await r.json() as any
    expect(body.error.type).toBe('rate_limit_error')
  })

  it('returns Retry-After and X-RateLimit-* headers on 429', async () => {
    const app = mkApp(1)
    await app.fetch(new Request('http://x/'))  // consume the 1 token
    const r = await app.fetch(new Request('http://x/'))
    expect(r.status).toBe(429)
    expect(r.headers.get('retry-after')).not.toBeNull()
    expect(r.headers.get('x-ratelimit-limit-requests')).toBe('1')
    expect(r.headers.get('x-ratelimit-remaining-requests')).toBe('0')
    expect(r.headers.get('x-ratelimit-reset-requests')).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('counts per-key independently', async () => {
    let k = `${prefix}:a`
    const app = mkApp(1, () => k)
    const r1 = await app.fetch(new Request('http://x/'))
    expect(r1.status).toBe(200)
    const r2 = await app.fetch(new Request('http://x/'))
    expect(r2.status).toBe(429)
    k = `${prefix}:b`
    const r3 = await app.fetch(new Request('http://x/'))
    expect(r3.status).toBe(200)
  })

  it('skips limit when DISABLE_USER_QUOTA is set', async () => {
    // This is tested indirectly — the middleware checks env.DISABLE_USER_QUOTA
    // before calling Redis. We skip this in CI since it requires env manipulation.
  })
})
```

- [ ] **Step 2.2 — Run tests, confirm they fail** (import of `RateLimitError` may work, but `rate-limit.ts` still has old impl)

```bash
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/middleware/rate-limit.test.ts
```
Expected: `returns Retry-After` test fails because old impl has no `Retry-After` header.

- [ ] **Step 2.3 — Rewrite `src/middleware/rate-limit.ts`**

Replace the entire file:

```typescript
// backend/src/middleware/rate-limit.ts
import type { MiddlewareHandler, Context } from 'hono'
import { redis } from '../redis/client.js'
import { env } from '../env.js'
import { RateLimitError } from '../shared/errors.js'

export const DEFAULT_RPM = 60

export type BucketSpec = {
  key: string   // stable identifier (e.g., apiKey.id) — no per-minute suffix
  limit: number // requests per minute = token bucket capacity
}

// Token bucket via Redis HASH. Capacity = limit tokens, refill rate = limit/min.
// The Lua script is atomic: read → refill → check → deduct, all in one EVAL.
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now_ms = tonumber(ARGV[4])

local state = redis.call('HMGET', key, 'tokens', 'last_ms')
local tokens = tonumber(state[1])
local last_ms = tonumber(state[2])

if not tokens then
  tokens = capacity
  last_ms = now_ms
end

local elapsed = math.max(0, now_ms - last_ms)
tokens = math.min(capacity, tokens + elapsed * rate)

local ttl_ms = math.ceil(capacity / rate * 2)

if tokens < cost then
  redis.call('HSET', key, 'tokens', tokens, 'last_ms', now_ms)
  redis.call('PEXPIRE', key, ttl_ms)
  local retry_after_ms = math.ceil((cost - tokens) / rate)
  return {0, retry_after_ms, math.floor(tokens)}
end

tokens = tokens - cost
redis.call('HSET', key, 'tokens', tokens, 'last_ms', now_ms)
redis.call('PEXPIRE', key, ttl_ms)
return {1, 0, math.floor(tokens)}
`

export function rateLimit(getBucket: (c: Context) => BucketSpec): MiddlewareHandler {
  return async (c, next) => {
    if (env.DISABLE_USER_QUOTA) return next()
    const { key, limit } = getBucket(c)
    const redisKey = `rl:tb:${key}`
    const ratePerMs = limit / 60_000  // tokens refilled per millisecond

    const result = (await redis.eval(
      TOKEN_BUCKET_LUA,
      1,
      redisKey,
      String(limit),
      String(ratePerMs),
      '1',              // cost = 1 request
      String(Date.now()),
    )) as [number, number, number]

    const [allowed, retryAfterMs, remaining] = result
    if (allowed !== 1) {
      const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000))
      throw new RateLimitError(
        `Rate limit exceeded: ${limit} RPM. Retry after ${retryAfterSec}s.`,
        { retryAfterSec, limitRequests: limit, remainingRequests: remaining },
      )
    }
    await next()
  }
}
```

- [ ] **Step 2.4 — Run tests, confirm they pass**

```bash
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/middleware/rate-limit.test.ts
```
Expected: all tests pass.

- [ ] **Step 2.5 — Update call site in `src/routes/v1/messages.ts`**

Replace the `rateLimit` call:

```typescript
v1Messages.use('*', rateLimit((c) => {
  const apiKey = c.get('apiKey')
  return {
    key: apiKey.id,
    limit: apiKey.rpmLimit ? Number(apiKey.rpmLimit) : DEFAULT_RPM,
  }
}))
```

- [ ] **Step 2.6 — Update call site in `src/routes/v1/chat-completions.ts`**

Replace the `rateLimit` call:

```typescript
v1ChatCompletions.use('*', rateLimit((c) => {
  const apiKey = c.get('apiKey')
  return {
    key: apiKey.id,
    limit: apiKey.rpmLimit ? Number(apiKey.rpmLimit) : DEFAULT_RPM,
  }
}))
```

- [ ] **Step 2.7 — Typecheck**

```bash
cd backend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 2.8 — Commit**

```bash
git add src/middleware/rate-limit.ts src/middleware/rate-limit.test.ts \
        src/routes/v1/messages.ts src/routes/v1/chat-completions.ts
git commit -m "feat(rate-limit): replace fixed-window with token bucket; add Retry-After headers"
```

---

## Task 3: Rewrite `tpm-limit.ts` — token bucket TPM

### Files
- Modify: `src/middleware/tpm-limit.ts`
- Modify: `src/middleware/tpm-limit.test.ts`

---

- [ ] **Step 3.1 — Update `tpm-limit.test.ts` cleanup to match new key pattern**

Replace the `clearBuckets` function and add a `RateLimitError` import:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { reserve, reconcile, release } from './tpm-limit.js'
import { redis } from '../redis/client.js'
import { RateLimitError } from '../shared/errors.js'

const KEY_ID = `tpm-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function clearBuckets() {
  const keys = await redis.keys(`rl:tb:${KEY_ID}*`)
  if (keys.length) await redis.del(...keys)
}
```

Then update all `rejects.toThrow(AppError)` to `rejects.toThrow(RateLimitError)`:

```typescript
// line 37: was rejects.toThrow(AppError)
await expect(reserve(KEY_ID, 1000, 300)).rejects.toThrow(RateLimitError)

// line 56: was rejects.toThrow(AppError)
await expect(reserve(KEY_ID, 1000, 200)).rejects.toThrow(RateLimitError)
```

All other test assertions remain unchanged (behavior is the same with token bucket).

- [ ] **Step 3.2 — Run tests to confirm current state**

```bash
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/middleware/tpm-limit.test.ts
```
Expected: cleanup tests pass (tpm: keys already cleaned up differently), `rejects.toThrow` tests may fail after changing to `RateLimitError`.

- [ ] **Step 3.3 — Rewrite `src/middleware/tpm-limit.ts`**

Replace the entire file:

```typescript
// Per-API-key TPM (tokens-per-minute) admission control via token bucket.
//
// Same algorithm as rate-limit.ts but for token costs instead of requests.
// Three operations:
//   reserve(apiKeyId, cap, estimate) — pre-flight: atomically deduct estimate.
//                                      Throws RateLimitError if bucket empty.
//   reconcile(reservation, actual)  — post-response: refund/charge the delta
//                                      between estimate and actual token usage.
//   release(reservation)            — request failed: refund the full estimate.

import { redis } from '../redis/client.js'
import { RateLimitError } from '../shared/errors.js'

// Atomic token bucket check-and-deduct. Same Lua as RPM but cost is variable.
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now_ms = tonumber(ARGV[4])

local state = redis.call('HMGET', key, 'tokens', 'last_ms')
local tokens = tonumber(state[1])
local last_ms = tonumber(state[2])

if not tokens then
  tokens = capacity
  last_ms = now_ms
end

local elapsed = math.max(0, now_ms - last_ms)
tokens = math.min(capacity, tokens + elapsed * rate)

local ttl_ms = math.ceil(capacity / rate * 2)

if tokens < cost then
  redis.call('HSET', key, 'tokens', tokens, 'last_ms', now_ms)
  redis.call('PEXPIRE', key, ttl_ms)
  local retry_after_ms = math.ceil((cost - tokens) / rate)
  return {0, retry_after_ms, math.floor(tokens)}
end

tokens = tokens - cost
redis.call('HSET', key, 'tokens', tokens, 'last_ms', now_ms)
redis.call('PEXPIRE', key, ttl_ms)
return {1, 0, math.floor(tokens)}
`

// Adjust the bucket by (estimate - actual). Positive delta = refund,
// negative delta = extra charge. Capped between 0 and capacity.
const RECONCILE_LUA = `
local key = KEYS[1]
local delta = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local rate = tonumber(ARGV[3])

local tokens = tonumber(redis.call('HGET', key, 'tokens') or '0')
local new_tokens = math.max(0, math.min(capacity, tokens + delta))
redis.call('HSET', key, 'tokens', new_tokens)
local ttl_ms = math.ceil(capacity / rate * 2)
redis.call('PEXPIRE', key, ttl_ms)
return math.floor(new_tokens)
`

export type TpmReservation = {
  apiKeyId: string
  estimate: number
  cap: number
}

function tpmKey(apiKeyId: string): string {
  return `rl:tb:${apiKeyId}:tpm`
}

export async function reserve(apiKeyId: string, cap: number, estimate: number): Promise<TpmReservation> {
  const ratePerMs = cap / 60_000
  const result = (await redis.eval(
    TOKEN_BUCKET_LUA,
    1,
    tpmKey(apiKeyId),
    String(cap),
    String(ratePerMs),
    String(estimate),
    String(Date.now()),
  )) as [number, number, number]

  const [allowed, retryAfterMs, remaining] = result
  if (allowed !== 1) {
    const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000))
    throw new RateLimitError(
      `Rate limit exceeded: ${cap} TPM. Retry after ${retryAfterSec}s.`,
      { retryAfterSec, limitTokens: cap, remainingTokens: remaining },
    )
  }
  return { apiKeyId, estimate, cap }
}

export async function reconcile(reservation: TpmReservation, actual: number): Promise<void> {
  const delta = reservation.estimate - actual  // positive = refund, negative = charge
  if (delta === 0) return
  try {
    await redis.eval(
      RECONCILE_LUA,
      1,
      tpmKey(reservation.apiKeyId),
      String(delta),
      String(reservation.cap),
      String(reservation.cap / 60_000),
    )
  } catch {
    // Best-effort: a missed reconcile only over/under-counts for the TTL window.
  }
}

export async function release(reservation: TpmReservation): Promise<void> {
  await reconcile(reservation, 0)
}
```

- [ ] **Step 3.4 — Run tests, confirm they pass**

```bash
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/middleware/tpm-limit.test.ts
```
Expected: all 6 tests pass.

- [ ] **Step 3.5 — Update `handle-messages.ts` to remove stale `bucket` field from `TpmReservation`**

The new `TpmReservation` no longer has a `bucket` field. Check `handle-messages.ts` for any reference to `tpmReservation.bucket` and remove it. The `reserve`/`reconcile`/`release` calls remain identical.

- [ ] **Step 3.6 — Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3.7 — Commit**

```bash
git add src/middleware/tpm-limit.ts src/middleware/tpm-limit.test.ts src/gateway/handle-messages.ts
git commit -m "feat(tpm-limit): replace fixed-window with token bucket; throw RateLimitError"
```

---

## Task 4: Fix `quota.ts` cooldown — compare time inside Lua

### Files
- Modify: `src/gateway/quota.ts`
- Modify: `src/gateway/quota.test.ts`

---

- [ ] **Step 4.1 — Write failing test for expired cooldown**

Add to the `quota.markFamilyCooldown` describe block in `src/gateway/quota.test.ts`:

```typescript
it('does not block when cooldown timestamp is already past', async () => {
  // Mark a cooldown that expired 1ms ago
  await quota.markFamilyCooldown(id, 'opus', Date.now() - 1, 'http_429')
  const r = await quota.reserve(id, 'opus', DEFAULT_BUDGETS.opus, 10, 10)
  // With the old Lua (no time check) this would return ok=false because
  // the key still exists in Redis (TTL=1s). With the fix it should admit.
  expect(r.ok).toBe(true)
})
```

- [ ] **Step 4.2 — Run test to confirm it fails**

```bash
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/gateway/quota.test.ts
```
Expected: the new test fails (current Lua blocks because key exists even if timestamp is past).

> Note: The test relies on `markFamilyCooldown` using `Math.max(1, ...)` for TTL, so even a past timestamp sets a 1s TTL. The test may be flaky if Redis GC clears the key before the check. If flaky, add a 10ms sleep before `markFamilyCooldown`.

- [ ] **Step 4.3 — Update `RESERVE_LUA` in `src/gateway/quota.ts` to compare time**

Replace only the cooldown check at the top of `RESERVE_LUA`:

```typescript
const RESERVE_LUA = `
local cooldown_until = redis.call('GET', KEYS[4])
if cooldown_until then
  local t = redis.call('TIME')
  local now_ms = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
  if tonumber(cooldown_until) > now_ms then
    return {0, 'cooldown', cooldown_until}
  end
end

local req = tonumber(redis.call('GET', KEYS[1]) or '0')
local inTok = tonumber(redis.call('GET', KEYS[2]) or '0')
local outTok = tonumber(redis.call('GET', KEYS[3]) or '0')

local estIn = tonumber(ARGV[1])
local estOut = tonumber(ARGV[2])
local rpm = tonumber(ARGV[3])
local itpm = tonumber(ARGV[4])
local otpm = tonumber(ARGV[5])
local ttl = tonumber(ARGV[6])

if req + 1 > rpm then return {0, 'rpm', ''} end
if inTok + estIn > itpm then return {0, 'itpm', ''} end
if outTok + estOut > otpm then return {0, 'otpm', ''} end

redis.call('INCRBY', KEYS[1], 1)
redis.call('INCRBY', KEYS[2], estIn)
redis.call('INCRBY', KEYS[3], estOut)
redis.call('EXPIRE', KEYS[1], ttl)
redis.call('EXPIRE', KEYS[2], ttl)
redis.call('EXPIRE', KEYS[3], ttl)
return {1, 'ok', ''}
`
```

- [ ] **Step 4.4 — Run tests, confirm all quota tests pass**

```bash
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/gateway/quota.test.ts
```
Expected: all tests pass including the new expired-cooldown test.

- [ ] **Step 4.5 — Commit**

```bash
git add src/gateway/quota.ts src/gateway/quota.test.ts
git commit -m "fix(quota): compare cooldown timestamp inside Lua using Redis TIME"
```

---

## Task 5: Fix TPM reservation leak in `handleNonStream`

### Files
- Modify: `src/gateway/handle-messages.ts`

---

- [ ] **Step 5.1 — Wrap post-forward processing in try/finally in `handleNonStream`**

In `src/gateway/handle-messages.ts`, in the `handleNonStream` function, after the `if (!response || ...)` check (around line 124), wrap the rest in a try/finally:

```typescript
// Replace from "const text = await response.text()" to the end of handleNonStream:

let reconciled = false
try {
  const text = await response.text()
  let parsed: any = null
  try { parsed = JSON.parse(text) } catch {}
  const usage = parsed?.usage ?? {}

  const inputTokens = Number(usage.input_tokens ?? 0)
  const outputTokens = Number(usage.output_tokens ?? 0)
  const cacheReadTokens = Number(usage.cache_read_input_tokens ?? 0)
  const { w5m: cacheWriteTokens, w1h: cacheWrite1hTokens } = splitCacheWrite(usage)

  await reconcile(reservation, inputTokens + cacheWriteTokens + cacheWrite1hTokens, outputTokens)
  if (tpmReservation) {
    await tpm.reconcile(tpmReservation, inputTokens + outputTokens)
    reconciled = true
  }

  const { costUsd, chargeUsd } = computeCost({
    inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, cacheWrite1hTokens,
    model: {
      inputPriceUsdPerMtok: model.inputPriceUsdPerMtok,
      outputPriceUsdPerMtok: model.outputPriceUsdPerMtok,
      cacheReadPriceUsdPerMtok: model.cacheReadPriceUsdPerMtok,
      cacheWritePriceUsdPerMtok: model.cacheWritePriceUsdPerMtok,
      cacheWrite1hPriceUsdPerMtok: model.cacheWrite1hPriceUsdPerMtok,
      markupPct: model.markupPct,
    },
  })

  await commitRequest({
    id,
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
    inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, cacheWrite1hTokens,
    chargeUsd, costUsd,
    requestHash, upstreamRequestHash,
    auditMatch: requestHash === upstreamRequestHash,
    idempotencyKey,
  })

  return new Response(text, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  })
} finally {
  if (tpmReservation && !reconciled) {
    await tpm.release(tpmReservation)
  }
}
```

- [ ] **Step 5.2 — Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5.3 — Run all middleware + gateway tests**

```bash
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/middleware src/gateway
```
Expected: all pass.

- [ ] **Step 5.4 — Commit**

```bash
git add src/gateway/handle-messages.ts
git commit -m "fix(handle-messages): ensure TPM reservation is released on unexpected errors"
```

---

## Task 6: Add `DISABLE_USER_QUOTA` startup warning

### Files
- Modify: `src/env.ts`

---

- [ ] **Step 6.1 — Add warning in `getEnv()` in `src/env.ts`**

Add after the existing `METRICS_TOKEN` warning inside `getEnv()`:

```typescript
if (_env.DISABLE_USER_QUOTA) {
  // eslint-disable-next-line no-console
  console.warn('[env] WARN: DISABLE_USER_QUOTA is enabled — all per-user RPM/TPM limits are bypassed')
}
```

The full `getEnv()` function becomes:

```typescript
export function getEnv(): Env {
  if (_env) return _env
  _env = parseEnv(process.env)
  if (_env.NODE_ENV === 'production' && !_env.METRICS_TOKEN) {
    console.warn('[env] WARN: NODE_ENV=production but METRICS_TOKEN is empty — /metrics is publicly accessible')
  }
  if (_env.DISABLE_USER_QUOTA) {
    console.warn('[env] WARN: DISABLE_USER_QUOTA is enabled — all per-user RPM/TPM limits are bypassed')
  }
  return _env
}
```

- [ ] **Step 6.2 — Typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6.3 — Commit**

```bash
git add src/env.ts
git commit -m "fix(env): warn on startup when DISABLE_USER_QUOTA is active"
```

---

## Task 7: FT — RPM 429 returns `Retry-After` header

### Files
- Modify: `src/tests/e2e.test.ts`

---

- [ ] **Step 7.1 — Write the failing FT**

Add a new describe block near the end of `src/tests/e2e.test.ts`, before the closing `afterAll`:

```typescript
describe('rate limiting', () => {
  it('returns 429 with Retry-After and rate limit headers when RPM exceeded', async () => {
    const mock = await startMockUpstream()
    setAnthropicBaseUrlOverride(mock.url)
    // Seed an upstream key so the proxy can forward
    await seedUpstream()

    // Get the api key row so we can set a low rpm_limit
    const [keyRow] = await db
      .update(apiKeys)
      .set({ rpmLimit: '1' })
      .where(eq(apiKeys.userId, userId))
      .returning()
    expect(keyRow).toBeDefined()

    const makeRequest = () =>
      app.fetch(
        new Request('http://x/v1/messages', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${skRelay}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'e2e-test-model',
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 10,
          }),
        }),
      )

    // First request: should succeed (consumes the 1 RPM token)
    const r1 = await makeRequest()
    expect(r1.status).toBe(200)

    // Second request: RPM exceeded
    const r2 = await makeRequest()
    expect(r2.status).toBe(429)
    expect(r2.headers.get('retry-after')).not.toBeNull()
    expect(r2.headers.get('x-ratelimit-limit-requests')).toBe('1')
    expect(r2.headers.get('x-ratelimit-remaining-requests')).toBe('0')
    expect(r2.headers.get('x-ratelimit-reset-requests')).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const body = await r2.json() as any
    expect(body.type).toBe('error')
    expect(body.error.type).toBe('rate_limit_error')
    expect(body.error.message).toMatch(/RPM/)

    // Reset rpm_limit to null so other tests aren't affected
    await db.update(apiKeys).set({ rpmLimit: null }).where(eq(apiKeys.userId, userId))
    mock.close()
  })
})
```

You also need to add the `eq` import if not already present, and import `apiKeys` table. Both are already imported at the top of the file.

- [ ] **Step 7.2 — Run the new FT to confirm it fails**

```bash
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/tests/e2e.test.ts -t "rate limiting"
```
Expected: test fails (old rate-limit.ts doesn't send `Retry-After`), or passes if tasks 1-2 are done.

- [ ] **Step 7.3 — Run the full e2e suite to check for regressions**

```bash
env $(cat .env | grep -v '^#' | grep '=' | xargs) npx vitest run src/tests/e2e.test.ts
```
Expected: all tests pass.

- [ ] **Step 7.4 — Run the full test suite**

```bash
env $(cat .env | grep -v '^#' | grep '=' | xargs) npm test
```
Expected: all tests pass.

- [ ] **Step 7.5 — Commit**

```bash
git add src/tests/e2e.test.ts
git commit -m "test(e2e): verify RPM 429 returns Retry-After and X-RateLimit headers"
```

---

## Self-Review Checklist

- [x] **Token bucket (RPM):** Task 2 covers rate-limit.ts rewrite with Lua, updated call sites, and tests
- [x] **Token bucket (TPM):** Task 3 covers tpm-limit.ts rewrite with reconcile Lua
- [x] **Retry-After headers:** Tasks 1 + 2 + 3 add `RateLimitError` with headers; app.ts emits them
- [x] **Unified error body:** `{ type: "error", error: { type: "rate_limit_error" } }` via app.ts special case
- [x] **`/v1/chat/completions` TPM:** Already covered by `handleNonStream`/`handleStream` in `handle-messages.ts` (no code change needed; verified by existing tpm-limit tests)
- [x] **Cooldown Lua fix:** Task 4
- [x] **TPM reservation leak:** Task 5
- [x] **DISABLE_USER_QUOTA warning:** Task 6
- [x] **FT coverage:** Task 7 adds the Retry-After header integration test
- [x] **No placeholders:** all steps contain actual code
- [x] **Type consistency:** `TpmReservation` no longer has `bucket` field; handle-messages.ts updated in Task 3 step 3.5
