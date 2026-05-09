# 前端移动端适配 — 设计规格

## 背景

当前前端在手机上存在多个关键问题：侧边栏隐藏后无任何替代导航、数据网格在小屏溢出、表格行固定宽度无法自适应。

---

## 问题清单

### 1. 移动端导航缺失（最高优先级）

Dashboard、Admin、Docs 三个 Layout 均通过 `responsive.css` 隐藏侧边栏（`display: none !important`），但没有提供任何替代导航。用户在手机上无法切换页面。

**方案：汉堡菜单 + Drawer 抽屉**

- 顶部导航栏左侧加汉堡按钮（`☰`），仅在 `max-width: 768px` 下显示
- 点击后从左侧滑出 Drawer，内容与原侧边栏完全一致
- Drawer 宽度 280px，覆盖页面，右侧显示半透明遮罩
- 点遮罩或任意菜单项后关闭 Drawer
- 用 CSS `transform: translateX` + `transition` 实现动画，无需第三方库
- 三个 Layout 共用同一套逻辑，各自内联实现（不抽共享组件，避免跨模块耦合）

### 2. 概览页 MetricCard 4 列网格

`repeat(4, 1fr)` 在手机（<768px）上极度拥挤。

**方案：** 在 `responsive.css` 增加：
- `<768px`：`grid-template-columns: repeat(2, 1fr)`
- 通过给 Overview 页面的 grid 容器加 className `metrics-grid` 来定位

### 3. API 密钥列表行溢出

每行 flex 布局含多个固定宽度列（120px × 2 + 110px + pill + 按钮），小屏水平溢出。

**方案：** 手机上改为两段式卡片布局：
- 上段：`KeyRound` 图标 + 密钥名称 + 状态 Pill + 操作按钮（靠右）
- 下段：创建时间、最近使用、限额，用小字灰色横排
- 通过给行容器加 className `key-row`，在 `responsive.css` 用 `flex-wrap` + media query 控制

### 4. 日志表格次要列隐藏

`LogsTable` 的 `minWidth: 960` 强制横向滚动，手机上 6 列全显示体验差。

**方案：** `<640px` 下隐藏次要列（请求 ID、输入 Tokens、输出 Tokens），保留时间、模型、状态、延迟。通过给 `<th>/<td>` 加 className 在 `responsive.css` 控制。

### 5. 账单发票表格

4 列（账单期间、金额、状态、下载）手机略挤。

**方案：** `<640px` 下把"下载发票"链接移到状态列下方，隐藏原第四列，账单期间列加宽。

---

## 修改文件

| 文件 | 改动内容 |
|------|---------|
| `frontend/src/pages/dashboard/Layout.jsx` | 加汉堡按钮状态 + Drawer 组件 |
| `frontend/src/pages/admin/Layout.jsx` | 同上 |
| `frontend/src/pages/docs/Layout.jsx` | 同上 |
| `frontend/src/pages/dashboard/Overview.jsx` | metrics-grid 加 className |
| `frontend/src/pages/dashboard/Keys.jsx` | key-row 加 className，下段信息加 className |
| `frontend/src/pages/dashboard/Logs.jsx` | 次要列加 className |
| `frontend/src/components/dashboard-widgets.jsx` | RequestsTable 次要列加 className |
| `frontend/src/pages/dashboard/Billing.jsx` | 发票表格调整 |
| `frontend/src/styles/responsive.css` | 新增所有 media query 规则 |

---

## 不做的事

- 不重构现有组件结构，只加 className 和 CSS
- 不引入任何新依赖
- Landing 页（已有较完整响应式）不动
- 不做 PWA / 底部导航栏
