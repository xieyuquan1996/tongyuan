# Landing UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对 `Landing.jsx` 做四处改动：Hero 加 Claude 图标、SignalCompare 卡片加命名区块、FAQ 文案全量替换、FAQ 宽度对齐。

**Architecture:** 纯展示层改动，全部集中在单一文件 `frontend/src/pages/marketing/Landing.jsx`。测试文件新建 `frontend/src/pages/marketing/Landing.test.jsx`，用 vitest + jsdom + @testing-library/react 验证渲染内容。

**Tech Stack:** React 18、vitest 4、@testing-library/react 16、jsdom

---

## 文件清单

| 操作 | 路径 |
|------|------|
| 修改 | `frontend/src/pages/marketing/Landing.jsx` |
| 新建 | `frontend/src/pages/marketing/Landing.test.jsx` |

---

## Task 1：写测试骨架并确认全部失败

**Files:**
- Create: `frontend/src/pages/marketing/Landing.test.jsx`

- [ ] **Step 1: 新建测试文件**

```jsx
// frontend/src/pages/marketing/Landing.test.jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Landing from "./Landing";

vi.mock("../../lib/api.js", () => ({
  api: vi.fn(() => Promise.resolve({})),
  session: { isAuthed: () => false },
}));

vi.mock("../../lib/hooks.js", () => ({
  useIsMobile: () => false,
}));

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>
  );
}

describe("Landing — Claude icon in Hero", () => {
  it("renders Claude SVG icon in the SectionLabel row", () => {
    renderLanding();
    expect(screen.getByRole("img", { name: "Claude" })).toBeInTheDocument();
  });
});

describe("Landing — SignalCompare card labels", () => {
  it("renders 透明传输 title in left card", () => {
    renderLanding();
    expect(screen.getByText("透明传输 (Transparent Pass-through)")).toBeInTheDocument();
  });

  it("renders 黑箱阉割 title in right card", () => {
    renderLanding();
    expect(screen.getByText("黑箱阉割 (Opaque Modification)")).toBeInTheDocument();
  });

  it("renders left card description", () => {
    renderLanding();
    expect(screen.getByText("完整透传系统提示词，保留 200k 全量上下文")).toBeInTheDocument();
  });

  it("renders right card description", () => {
    renderLanding();
    expect(screen.getByText("悄悄替换廉价模型，强制截断 System Prompt 导致逻辑崩坏")).toBeInTheDocument();
  });
});

describe("Landing — FAQ", () => {
  it("renders h2 as 常见FAQ", () => {
    renderLanding();
    expect(screen.getByRole("heading", { level: 2, name: "常见FAQ" })).toBeInTheDocument();
  });

  it("renders new Q1", () => {
    renderLanding();
    expect(screen.getByText("如何验证模型响应的真实性？")).toBeInTheDocument();
  });

  it("renders new Q2", () => {
    renderLanding();
    expect(screen.getByText("中转链路如何实现比直连更低的延迟？")).toBeInTheDocument();
  });

  it("renders new Q3", () => {
    renderLanding();
    expect(screen.getByText("Anthropic 发布新模型后，多久可以接入？")).toBeInTheDocument();
  });

  it("renders new Q4", () => {
    renderLanding();
    expect(screen.getByText("是否兼容现有的 OpenAI / Anthropic 生态？")).toBeInTheDocument();
  });

  it("renders new Q5", () => {
    renderLanding();
    expect(screen.getByText("是否支持企业财务合规报销？")).toBeInTheDocument();
  });

  it("FAQ content container uses maxWidth 1216", () => {
    renderLanding();
    const faqContent = screen.getByTestId("faq-content");
    expect(faqContent).toHaveStyle({ maxWidth: "1216px" });
  });
});
```

- [ ] **Step 2: 运行测试，确认全部 FAIL**

```bash
cd frontend && npx vitest run src/pages/marketing/Landing.test.jsx
```

预期：所有测试 FAIL（"getByRole img name Claude not found" 等）

---

## Task 2：Hero SectionLabel 加 Claude 图标

**Files:**
- Modify: `frontend/src/pages/marketing/Landing.jsx`（`Hero` 函数）

- [ ] **Step 1: 在 `Hero()` 的 SectionLabel 中加入 Claude SVG 图标**

找到 `Hero()` 里的：
```jsx
<SectionLabel>枫连 · MAPLELINK · SAME SOURCE</SectionLabel>
```

替换为：
```jsx
<SectionLabel>
  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
    枫连 · MAPLELINK · SAME SOURCE
    <svg
      role="img"
      aria-label="Claude"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      style={{ verticalAlign: "middle", opacity: 0.8 }}
    >
      <path
        d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 2.5a7.5 7.5 0 0 1 5.5 12.64V17a5.5 5.5 0 0 0-11 0v.14A7.5 7.5 0 0 1 12 4.5zM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
        fill="var(--clay-press)"
      />
    </svg>
  </span>
</SectionLabel>
```

- [ ] **Step 2: 运行 Claude icon 相关测试**

```bash
cd frontend && npx vitest run src/pages/marketing/Landing.test.jsx -t "Claude icon"
```

预期：PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/marketing/Landing.jsx frontend/src/pages/marketing/Landing.test.jsx
git commit -m "feat(landing): add Claude icon to Hero SectionLabel"
```

---

## Task 3：SignalCompare 卡片加命名区块

**Files:**
- Modify: `frontend/src/pages/marketing/Landing.jsx`（`SignalCompare` 函数）

- [ ] **Step 1: 左卡 Pill 下方插入命名区块**

找到左卡的：
```jsx
<div style={compareCard}>
  <Pill tone="clay" dot style={{ marginBottom: 16 }}>枫连</Pill>
  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay-press)", marginBottom: 8 }}>完整透传 · 信号干净</div>
```

替换为：
```jsx
<div style={compareCard}>
  <Pill tone="clay" dot style={{ marginBottom: 12 }}>枫连</Pill>
  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
    透明传输 (Transparent Pass-through)
  </div>
  <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 12, lineHeight: 1.5 }}>
    完整透传系统提示词，保留 200k 全量上下文
  </div>
  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--clay-press)", marginBottom: 8 }}>完整透传 · 信号干净</div>
```

- [ ] **Step 2: 右卡 Pill 下方插入命名区块**

找到右卡的：
```jsx
<div style={compareCard}>
  <Pill style={{ marginBottom: 16 }} dot>其他中转</Pill>
  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>偷换、截断、压缩</div>
```

替换为：
```jsx
<div style={compareCard}>
  <Pill style={{ marginBottom: 12 }} dot>其他中转</Pill>
  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-3)", marginBottom: 4 }}>
    黑箱阉割 (Opaque Modification)
  </div>
  <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 12, lineHeight: 1.5 }}>
    悄悄替换廉价模型，强制截断 System Prompt 导致逻辑崩坏
  </div>
  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>偷换、截断、压缩</div>
```

- [ ] **Step 3: 运行 SignalCompare 相关测试**

```bash
cd frontend && npx vitest run src/pages/marketing/Landing.test.jsx -t "SignalCompare"
```

预期：4 个测试全部 PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/marketing/Landing.jsx
git commit -m "feat(landing): add 透明传输/黑箱阉割 labels to compare cards"
```

---

## Task 4：FAQ 文案替换 + h2 + 宽度修正

**Files:**
- Modify: `frontend/src/pages/marketing/Landing.jsx`（`Faq` 函数）

- [ ] **Step 1: 在 `Faq()` 中加 `data-testid` 并替换 h2**

找到：
```jsx
<div style={{ maxWidth: 880, margin: "0 auto" }}>
  <SectionLabel>常见问题</SectionLabel>
  <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 40, lineHeight: 1.15, fontWeight: 600, letterSpacing: "-0.015em", margin: "0 0 32px" }}>
    预先回答几个怀疑。
  </h2>
```

替换为：
```jsx
<div data-testid="faq-content" style={{ maxWidth: 1216, margin: "0 auto" }}>
  <SectionLabel>常见问题</SectionLabel>
  <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 40, lineHeight: 1.15, fontWeight: 600, letterSpacing: "-0.015em", margin: "0 0 32px" }}>
    常见FAQ
  </h2>
```

- [ ] **Step 2: 替换 `items` 数组**

找到：
```jsx
const items = [
  ["你们怎么证明没有偷换模型？", "每一次请求我们都会把上行的 model / max_tokens / system 长度做哈希记录，控制台里可以按请求 ID 查询到完整审计。如果发现一次不一致，我们退一个月费用。"],
  ["延迟为什么比直连快？", "我们在中国大陆有四个机房（上海、北京、深圳）和香港中转，使用 Anthropic 的官方 API endpoint，没有 IP 池漂移。p99 延迟稳定在 500ms 内。"],
  ["新模型多久会上架？", "Anthropic 发布后通常 4 小时内可用。我们不会自作主张做 alias，所有模型用官方完整 ID。"],
  ["支持哪些 SDK？", "完全兼容官方 anthropic-sdk-python / anthropic-sdk-typescript。把 base URL 换成 api.maplelink.ai 就可以，其他什么都不用改。"],
  ["可以发票吗？", "可开 6% 增值税专票，在控制台 → 账单 → 发票申请。"],
];
```

替换为：
```jsx
const items = [
  ["如何验证模型响应的真实性？", "我们为每一笔请求生成唯一的 Audit ID。你可以在控制台中通过该 ID 追溯完整的哈希记录，包含上行 model 字段、max_tokens 参数及 system prompt 长度。我们承诺：若发现单次模型指纹（Fingerprint）不一致，补偿当月全额费用。"],
  ["中转链路如何实现比直连更低的延迟？", "我们在全球核心节点部署了 BGP 最佳路径优化与 Anycast 网络。通过枫连专线绕过公网拥塞，直接对接 Anthropic 骨干网边缘。对于国内开发者，我们通过 CN2/GIA 极速链路将首字响应（TTFT）优化至毫秒级，有效规避了公网直连的丢包与抖动。"],
  ["Anthropic 发布新模型后，多久可以接入？", "通常在官方发布后的 4 小时内完成全节点上架。"],
  ["是否兼容现有的 OpenAI / Anthropic 生态？", "枫连完全兼容 OpenAI 格式接口与 Anthropic 原生格式。无论是直接调用 LangChain、LlamaIndex，还是使用 Cursor、NextChat 等客户端，只需修改 BASE_URL 即可无缝切换。"],
  ["是否支持企业财务合规报销？", "支持。我们提供正式企业增值税普通发票，类目可选"信息技术服务"或"软件服务"。针对团队用户，我们支持按月度导出详细账单流水（Consumption Report），满足企业级审计与支出凭证需求。"],
];
```

- [ ] **Step 3: 运行 FAQ 相关测试**

```bash
cd frontend && npx vitest run src/pages/marketing/Landing.test.jsx -t "FAQ"
```

预期：8 个测试全部 PASS

- [ ] **Step 4: 运行全量前端测试确认无回归**

```bash
cd frontend && npm test
```

预期：全部 PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/marketing/Landing.jsx
git commit -m "feat(landing): replace FAQ copy, fix FAQ width to 1216"
```
