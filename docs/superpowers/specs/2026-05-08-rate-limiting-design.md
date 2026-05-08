# 限流系统重构设计文档

**日期：** 2026-05-08  
**状态：** 已批准，待实现

---

## 背景

当前限流系统存在以下核心问题：

1. Layer 1 & 2 使用固定窗口（Fixed Window），在窗口边界处可能出现 2× 突发流量
2. `/v1/chat/completions` 端点缺少 TPM 限流，与 `/v1/messages` 不一致
3. 三层限流的错误消息格式各不相同，缺少 `Retry-After` 响应头
4. TPM 预留在流式响应异常路径下存在泄漏风险
5. TPM 预估与调和逻辑不对称（cache token 场景）
6. Lua 冷却期脚本未在脚本内比较当前时间
7. `DISABLE_USER_QUOTA` 开关无日志记录

---

## 架构概览

三层限流架构保持不变，全面升级实现：

```
用户请求
   ↓
[Layer 1] API 密钥 RPM 令牌桶（redis Lua 原子操作）
   ↓
[Layer 2] API 密钥 TPM 令牌桶（覆盖 /messages 和 /chat/completions）
   ↓
[Layer 3] 上游密钥配额（现有 Lua 脚本，修复冷却期比较）
   ↓
Anthropic API
```

Files API（`/v1/files`）维持现状，不加限流。  
上游 429 处理逻辑维持现状。

---

## Layer 1 & 2：令牌桶实现

### 替换原因

固定窗口在边界处存在双倍突发问题：第 59.9s 消耗全部配额，第 60.1s 新窗口立即允许同等数量请求，导致实际 2× 突发。令牌桶以持续补充速率替代重置机制，平滑限流。

### Redis 数据结构

```
rl:tb:{keyId}:rpm  →  HASH { tokens: float, last_refill_ms: int }
rl:tb:{keyId}:tpm  →  HASH { tokens: float, last_refill_ms: int }
```

- `tokens`：当前可用令牌数（浮点，允许小数积累）
- `last_refill_ms`：上次补充时间（Unix 毫秒）
- TTL：`ceil(capacity / rate * 2) * 1000` 毫秒（至少 120s）

### Lua 脚本逻辑（原子执行）

```lua
-- 参数: KEYS[1]=桶key, ARGV[1]=capacity, ARGV[2]=rate(tokens/ms),
--       ARGV[3]=cost, ARGV[4]=now_ms
local state = redis.call('HMGET', KEYS[1], 'tokens', 'last_refill_ms')
local tokens = tonumber(state[1]) or tonumber(ARGV[1])  -- 首次默认满桶
local last_ms = tonumber(state[2]) or tonumber(ARGV[4])

-- 补充令牌
local elapsed = math.max(0, tonumber(ARGV[4]) - last_ms)
local refill = elapsed * tonumber(ARGV[2])
tokens = math.min(tonumber(ARGV[1]), tokens + refill)

-- 检查是否足够
local cost = tonumber(ARGV[3])
if tokens < cost then
  -- 返回: {0, retry_after_ms}
  local wait_ms = math.ceil((cost - tokens) / tonumber(ARGV[2]))
  return {0, wait_ms}
end

-- 扣减并写回
tokens = tokens - cost
redis.call('HSET', KEYS[1], 'tokens', tokens, 'last_refill_ms', ARGV[4])
redis.call('PEXPIRE', KEYS[1], math.ceil(tonumber(ARGV[1]) / tonumber(ARGV[2]) * 2 * 1000))
-- 返回: {1, remaining_tokens}
return {1, math.floor(tokens)}
```

### 参数映射

| 参数 | RPM | TPM |
|------|-----|-----|
| capacity | `rpm_limit`（桶上限） | `tpm_limit` |
| rate | `rpm_limit / 60000`（tokens/ms） | `tpm_limit / 60000` |
| cost | `1`（每次请求） | 预估 token 数（调和前）|

### 中间件接口

```typescript
// src/middleware/rate-limit.ts（重构后）
export function rateLimit(getConfig: (c: Context) => {
  keyId: string
  limit: number        // rpm_limit or tpm_limit
  cost?: number        // 默认 1（RPM）；TPM 传入预估值
  type: 'rpm' | 'tpm'
}): MiddlewareHandler

// 返回的 429 响应附带 Retry-After 和 X-RateLimit-* 头
```

---

## TPM 统一：补全 /chat/completions

### 当前差异

| 端点 | RPM | TPM |
|------|-----|-----|
| `POST /v1/messages` | ✓ | ✓ |
| `POST /v1/chat/completions` | ✓ | ✗ |

### 修复方案

在 `chat-completions.ts` 路由中，复用 `tpm-limit.ts` 的 `reserve` / `reconcile` 接口：

1. 请求进入时，用 `estimateInputTokens` + `estimateOutputTokens` 预估 token 数，调用令牌桶扣减
2. 响应结束（流式或非流式）后，用实际 token 数调和：`reconcile(reservation, actualTokens)`
3. 调和逻辑：`actual - estimated` 的差值补回或追扣令牌桶

### TPM 预估/调和不对称修复

当前问题：预估使用 `cap + estOut`，调和使用 `inputTokens + outputTokens`，cache token 未统一处理。

修复：调和时统一使用 `usage.input_tokens + usage.output_tokens`（含 cache read tokens），与预估口径对齐。

---

## 错误消息统一

### 响应体格式

所有 429 响应统一为：

```json
{
  "type": "error",
  "error": {
    "type": "rate_limit_error",
    "message": "Rate limit exceeded: {limit} {unit}. Retry after {n}s."
  }
}
```

示例消息：
- `"Rate limit exceeded: 60 RPM. Retry after 12s."`
- `"Rate limit exceeded: 100000 TPM. Retry after 3s."`
- `"Rate limit exceeded: all upstream keys saturated. Retry after 60s."`

### 响应头

```
Retry-After: 12
X-RateLimit-Limit-Requests: 60
X-RateLimit-Remaining-Requests: 0
X-RateLimit-Reset-Requests: 2026-05-08T10:23:45Z
```

TPM 触发时额外附加：
```
X-RateLimit-Limit-Tokens: 100000
X-RateLimit-Remaining-Tokens: 0
X-RateLimit-Reset-Tokens: 2026-05-08T10:23:45Z
```

### 统一工具函数

```typescript
// src/shared/errors.ts 新增
export function formatRateLimitError(opts: {
  limit: number
  unit: 'RPM' | 'TPM' | string
  retryAfterMs: number
}): { body: object; headers: Record<string, string> }
```

---

## 其他修复

### TPM 预留泄漏修复

当前问题：流式响应在异常路径下存在多个 exit 点，`release()` 调用可能被跳过。

修复：在 `handle-messages.ts` 中将 `tpm.release()` 移入 `try/finally` 块，确保任何路径下都执行。

```typescript
const tpmReservation = await reserveTpm(apiKey, body)
try {
  // ... 处理逻辑
} finally {
  if (tpmReservation && !reconciled) {
    await tpm.release(tpmReservation)
  }
}
```

### Lua 冷却期时间比较修复

当前问题：`quota.ts` 的 RESERVE_LUA 脚本检查冷却键是否存在，但不在脚本内比较时间戳（依赖 TTL 过期）。

修复：在 Lua 脚本中用 `redis.call('TIME')` 获取当前时间，与存储的冷却截止时间戳比较，过期则忽略：

```lua
local cooldown_until = redis.call('GET', KEYS[4])
if cooldown_until then
  local now_sec = redis.call('TIME')[1]
  if tonumber(cooldown_until) > tonumber(now_sec) * 1000 then
    return {0, 'cooldown', cooldown_until}
  end
end
```

### DISABLE_USER_QUOTA 启动日志

在应用启动时（`src/index.ts` 或 `src/env.ts` 加载后）检查并打印警告：

```typescript
if (env.DISABLE_USER_QUOTA) {
  console.warn('[WARN] DISABLE_USER_QUOTA is enabled — all per-user rate limits are bypassed')
}
```

---

## 文件变更范围

| 文件 | 变更类型 |
|------|--------|
| `src/middleware/rate-limit.ts` | 重构：固定窗口 → 令牌桶 Lua |
| `src/middleware/tpm-limit.ts` | 重构：复用令牌桶逻辑，修复预估/调和不对称 |
| `src/gateway/quota.ts` | 修复：冷却期 Lua 内时间比较 |
| `src/routes/v1/chat-completions.ts` | 新增：TPM 预留与调和 |
| `src/gateway/handle-messages.ts` | 修复：TPM 预留泄漏，finally 统一 release |
| `src/shared/errors.ts` | 新增：`formatRateLimitError()` 工具函数 |
| `src/index.ts` | 新增：DISABLE_USER_QUOTA 启动警告 |

---

## 测试策略

### 单元测试（UT）

- `rate-limit.test.ts`：令牌桶 Lua 脚本逻辑（补充速率、桶上限、并发扣减）
- `errors.test.ts`：`formatRateLimitError()` 输出格式

### 组件测试（CT）

- `rate-limit.test.ts`：真实 Redis 下的令牌桶行为（burst、refill、边界）
- `tpm-limit.test.ts`：预估/调和对称性，泄漏修复验证

### 功能测试（FT）

- `e2e.test.ts` 扩展：RPM 触发 429 并验证 `Retry-After` 响应头
- `e2e.test.ts` 扩展：`/v1/chat/completions` TPM 限流触发验证
- `session-ttl.test.ts` 类比：令牌桶跨分钟边界补充验证

---

## 不在本次范围内

- Files API 限流（维持现状）
- 上游 429 处理逻辑改动（维持现状）
- 多进程配额缓存一致性（留作后续）
- 管理后台限流配置 UI 改进
