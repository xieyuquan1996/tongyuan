# 设计：请求日志展示首字节延迟（display_latency_ms）

**日期：** 2026-05-08

## 背景

当前请求日志 API 返回 `latency_ms`（总延迟）。对于流式请求，总延迟包含整个流传输时间，数值偏高，不能反映用户感知的响应速度。数据库已存有 `ttfb_ms`（首字节延迟），但未暴露给前端。

## 目标

- 日志 UI 展示更贴近用户感知的延迟指标
- 流式请求展示首字节延迟，非流式请求展示总延迟

## 核心逻辑

```
display_latency_ms = (stream && ttfb_ms != null) ? ttfb_ms : latency_ms
```

## 改动范围

### 后端

**`routes/console/logs.ts`（列表 & 详情）**
- 移除 `latency_ms` 字段
- 新增 `display_latency_ms`（按上述公式计算）
- 不暴露 `ttfb_ms`

**`routes/admin/logs.ts`（列表 & 详情）**
- 保留 `latency_ms`（向后兼容）
- 新增 `ttfb_ms`（原始值，null 表示非流式）
- 新增 `display_latency_ms`
- 列表查询需补选 `ttfbMs` 字段

**`routes/admin/users.ts`**
- 保留 `latency_ms`
- 新增 `ttfb_ms`、`display_latency_ms`

### 前端（5 处）

将 `latency_ms` 替换为 `display_latency_ms`：

| 文件 | 位置 |
|------|------|
| `pages/dashboard/Logs.jsx` | 列表行（line 307）、详情抽屉（line 345） |
| `pages/admin/Logs.jsx` | 列表行（line 92）、详情摘要行（line 204） |
| `components/dashboard-widgets.jsx` | 最近请求 widget（line 136） |

### 不改动

- `overview.ts` p99 计算和 latency_series — 统计分析继续用总延迟
- `alert-notifier.ts` p99_latency 告警 — 同上
- Prometheus 指标 `gateway_latency_ms` — 监控层保持不变
- 数据库 schema — 无需迁移

## 测试要求

- CT：`biller.test.ts` 验证流式/非流式请求的 `display_latency_ms` 计算正确
- FT：`e2e.test.ts` 或新增 FT 验证 `/api/console/logs` 响应包含 `display_latency_ms`，不含 `latency_ms`
- Frontend CT：`dashboard/Logs.test.jsx` 验证展示 `display_latency_ms`
