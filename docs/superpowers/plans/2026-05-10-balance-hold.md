# Balance Hold（余额预扣）实现计划

**Goal:** 在请求开始时原子预扣估算费用，请求结束后用真实费用调平，消除并发长输出场景下余额超支的 TOCTOU 漏洞。

**Worktree:** `.worktrees/balance-hold`（分支 `balance-hold`）

---

## 依赖链分析

```
meter.ts（新增 computeHoldUsd）
    ↓ 被调用
messages.ts、chat-completions.ts（解析 body 后调 holdBalance + computeHoldUsd）
    ↓ 传入
handle-messages.ts（HandleMessagesInput 新增 balanceHoldUsd）
    ↓ 传入
biller.ts（holdBalance 新函数；CommitInput 新增 balanceHoldUsd；commitRequest 改调平逻辑）
```

反向检查：`pool` 已在 `db/client.ts` 导出 ✓，无需新增迁移 ✓

---

## 测试矩阵

### UT — 纯逻辑，无 I/O（`src/gateway/meter.test.ts`，新建）

| # | 测试点 | 验证内容 |
|---|--------|---------|
| U1 | max_tokens 已指定（1000） | hold ≥ 1000 × 输出单价，且在合理范围内 |
| U2 | max_tokens 超过 8192 上限（100000） | hold 被 cap 住，不超过 8192 × 输出单价 + 小量 |
| U3 | max_tokens 未指定 | hold 使用默认输出量（约 4096 token 级别） |
| U4 | markup 20% 正确叠加 | holdWith20%markup ≈ holdBase × 1.2（精度 4 位） |

### CT — 服务层 + 真实 DB（`src/gateway/biller.test.ts`，追加）

| # | 测试点 | 验证内容 |
|---|--------|---------|
| C1 | holdBalance 正常预扣 | balance 减少 holdUsd |
| C2 | holdBalance 余额不足 | 抛 `insufficient_balance`，balance 不变 |
| C3 | holdBalance 顺序两次耗尽余额 | 第二次失败，balance 仅扣第一次 |
| C4 | commitRequest：actual < hold | balance 退回差额（hold - actual） |
| C5 | commitRequest：actual > hold | balance 额外扣减（actual - hold） |
| C6 | commitRequest：actual = 0（出错路径） | 全额退还 hold，balance 回到预扣前 |
| C7 | commitRequest：hold = 0（兼容旧行为） | 直接扣 chargeUsd，行为与改动前一致 |

### FT — 完整 HTTP 栈（`src/tests/e2e.test.ts`，追加）

| # | 测试点 | 验证内容 |
|---|--------|---------|
| F1 | 并发两请求，余额只够一个 hold | 一个 200，一个 402，最终 balance ≥ 0 |
| F2 | 余额为 0 时发起请求 | 返回 402 `insufficient_balance` |
| F3 | upstream 返回 502，hold 被退还 | balance 回到预扣前水平，不被扣费 |

---

## 任务列表

### Task 1 — `computeHoldUsd`（meter.ts）
- [ ] 写 U1–U4 失败测试（新建 `src/gateway/meter.test.ts`）
- [ ] 确认测试失败
- [ ] 实现 `computeHoldUsd`：`estimateInputTokens` + `min(max_tokens, 8192)` × 输出单价 × (1 + markup)
- [ ] 通过 U1–U4
- [ ] commit

### Task 2 — `holdBalance` + `commitRequest` 改造（biller.ts）
- [ ] 写 C1–C7 失败测试（追加到 `src/gateway/biller.test.ts`）
- [ ] 确认测试失败
- [ ] 实现 `holdBalance`：原子 `UPDATE users SET balance_usd = balance_usd - $hold WHERE id = $id AND balance_usd >= $hold`，0 行受影响则抛 `insufficient_balance`
- [ ] 改 `CommitInput`：新增 `balanceHoldUsd: string`
- [ ] 改 `commitRequest` 结算逻辑：hold > 0 时做 `balance += (hold - actual)` 调平；hold = 0 时保持原有行为
- [ ] 通过 C1–C7
- [ ] commit

### Task 3 — 线程传递（handle-messages.ts、messages.ts、chat-completions.ts）
- [ ] `HandleMessagesInput` 新增 `balanceHoldUsd: string`
- [ ] `handle-messages.ts` 两处 `commitRequest` 调用（成功路径和失败路径）均带上 `balanceHoldUsd`
- [ ] `messages.ts`：body 解析 + model 加载后，调 `computeHoldUsd` + `holdBalance`，将 holdUsd 传入 input
- [ ] `chat-completions.ts`：同上，使用转换后的 `anthropicBody`
- [ ] `npx tsc --noEmit` 0 错误
- [ ] commit

### Task 4 — FT（e2e.test.ts）
- [ ] 写 F1–F3 失败测试
- [ ] 确认测试失败
- [ ] 通过 F1–F3
- [ ] commit

### Task 5 — 全量回归
- [ ] `npm test` 全部通过（含原有 293 个）
- [ ] `npx tsc --noEmit` 0 错误
