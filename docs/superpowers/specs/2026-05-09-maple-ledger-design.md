# Maple Ledger — Design Spec

MapleLink 中转站记账网站，用于追踪经营收支和汇率损耗。

## 背景

MapleLink 是 Claude API 中转网关，运营涉及三种货币：

- **支出端：** 用 CAD 购买 Anthropic API token（USD 定价），经过银行 CAD→USD 换汇，含消费税和手续费
- **收入端：** 用户按 USD 用量计费，实际通过微信转账支付 RMB，中转站设定 USD→RMB 汇率

管理员需要一个工具来记录每笔收支，并以 CAD 为基准计算利润。

## 核心公式

```
利润(CAD) = Σ收入(CAD) - Σ支出(CAD)

其中：
  收入(CAD) = RMB金额 ÷ 中转站USD/RMB汇率 × 当天CAD/USD市场汇率
  支出(CAD) = 银行账单最终扣款（已含税、汇率、手续费）
```

## 架构

- **部署：** Cloudflare Pages + Pages Functions
- **数据库：** Cloudflare D1 (SQLite)
- **认证：** Cloudflare Access（邮箱白名单，零代码）
- **前端：** React + Vite + TailwindCSS
- **后端：** Hono (Pages Functions) + Drizzle ORM
- **汇率 API：** 自动拉取当天 CAD/USD 市场汇率（exchangerate.host 或类似免费服务）

## 数据模型

### transactions

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | nanoid |
| type | TEXT | 'income' \| 'expense' |
| date | TEXT | 交易日期 YYYY-MM-DD |
| amount | REAL | 原始金额 |
| currency | TEXT | 'CAD'（支出）\| 'RMB'（收入） |
| usd_rmb_rate | REAL | 收入用：中转站 USD→RMB 汇率 |
| cad_usd_market_rate | REAL | 当天 CAD/USD 市场汇率（自动填入，可覆盖） |
| amount_cad | REAL | 换算后的 CAD 金额（计算字段，存储以加速报表） |
| note | TEXT | 备注 |
| category | TEXT | 分类：api_topup, user_payment, server, other |
| tax | REAL | 选填，支出的消费税（CAD） |
| bank_rate | REAL | 选填，银行实际 CAD→USD 汇率 |
| market_rate_at_purchase | REAL | 选填，购买时市场 CAD→USD 汇率（用于算损耗） |
| created_by | TEXT | 操作人邮箱（从 CF Access header 获取） |
| created_at | TEXT | ISO 时间戳 |
| updated_at | TEXT | ISO 时间戳 |

### amount_cad 计算逻辑

- 支出：`amount_cad = amount`（已经是 CAD）
- 收入：`amount_cad = amount / usd_rmb_rate * cad_usd_market_rate`

### 汇率损耗计算

当支出记录填写了 `bank_rate` 和 `market_rate_at_purchase` 时：

```
损耗(CAD) = amount - (amount / bank_rate) * market_rate_at_purchase
损耗百分比 = (bank_rate - market_rate_at_purchase) / market_rate_at_purchase * 100
```

不单独建表，从 transactions 中筛选有 bank_rate 的支出记录即可。

## API 设计

所有 API 在 `/api/` 路径下，由 Pages Functions 处理。

### 交易 CRUD

```
GET    /api/transactions?month=2026-05&type=income&category=api_topup
POST   /api/transactions
PUT    /api/transactions/:id
DELETE /api/transactions/:id
```

### 报表

```
GET    /api/reports/monthly?month=2026-05
  → { income_rmb, income_cad, expense_cad, profit_cad, tx_count }

GET    /api/reports/exchange-loss?from=2026-01-01&to=2026-05-31
  → { total_loss_cad, avg_loss_pct, records: [...] }
```

### 汇率

```
GET    /api/exchange-rate?pair=CAD_USD
  → { rate, source, date }
```

自动从外部 API 拉取当天汇率，缓存到 D1 避免重复请求。

## 前端页面

### 1. 交易列表（首页）

- 按月切换，显示当月所有交易
- 每行：日期、类型图标、金额(原始)、金额(CAD)、备注、分类标签
- 顶部汇总卡片：本月收入(CAD)、本月支出(CAD)、本月利润(CAD)
- 筛选：按类型、分类
- 新增按钮

### 2. 录入/编辑表单（弹窗）

- 类型切换：收入 / 支出
- 收入字段：RMB 金额、中转站 USD/RMB 汇率、CAD/USD 市场汇率（自动填入）、日期、备注、分类
- 支出字段：CAD 金额、日期、备注、分类、税（选填）、银行汇率（选填）、市场汇率（选填）
- 实时预览换算后的 CAD 金额

### 3. 月度报表

- 月份选择器
- 汇总数据：总收入(RMB)、总收入(CAD)、总支出(CAD)、利润(CAD)、利润率
- 按分类饼图
- 趋势折线图（近 6 个月利润走势）

### 4. 汇率损耗分析

- 时间范围选择
- 汇总：总损耗(CAD)、平均损耗百分比
- 每笔明细：日期、金额、银行汇率、市场汇率、损耗

## 认证

Cloudflare Access 配置：

- 保护整个域名（如 ledger.maplelink.club）
- 允许策略：管理员邮箱列表
- 后端通过 `Cf-Access-Authenticated-User-Email` header 识别操作人

无需在应用内实现登录逻辑。

## 项目结构

```
maple-ledger/
├── src/                        # React 前端
│   ├── pages/
│   │   ├── Transactions.tsx
│   │   ├── MonthlyReport.tsx
│   │   └── ExchangeLoss.tsx
│   ├── components/
│   │   ├── TransactionForm.tsx
│   │   ├── SummaryCards.tsx
│   │   └── Layout.tsx
│   ├── lib/
│   │   └── api.ts
│   └── main.tsx
├── functions/                  # Pages Functions (API)
│   └── api/
│       ├── transactions.ts
│       ├── exchange-rate.ts
│       ├── reports/
│       │   ├── monthly.ts
│       │   └── exchange-loss.ts
│       └── _middleware.ts
├── db/
│   └── schema.ts              # Drizzle schema
├── package.json
├── vite.config.ts
├── wrangler.toml              # D1 绑定
├── tailwind.config.js
└── tsconfig.json
```

## 部署

1. 创建 D1 数据库：`wrangler d1 create maple-ledger`
2. 配置 `wrangler.toml` 绑定 D1
3. 连接 GitHub 仓库到 Cloudflare Pages
4. 配置 Cloudflare Access 策略
5. `git push` 自动部署

## 不做的事

- 不做用户维度对账
- 不做自动从 MapleLink 后端拉取数据
- 不做多币种钱包/余额管理
- 不做发票/税务报表生成
