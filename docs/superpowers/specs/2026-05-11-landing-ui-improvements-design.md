# Landing 页面 UI 改进设计

**日期：** 2026-05-11  
**文件：** `frontend/src/pages/marketing/Landing.jsx`（唯一改动文件）

---

## 改动 1 — Hero SectionLabel 加 Claude 官方图标

**位置：** `Hero()` 组件内的 `<SectionLabel>` 子内容末尾

**方案：** 在"枫连 · MAPLELINK · SAME SOURCE"文字之后，紧跟一个 Claude SVG 图标（inline，14×14px），颜色使用 `var(--clay-press)`，与文字垂直居中对齐。

**目的：** 增强视觉可信度，让用户第一眼感知到这是官方 Claude API 接入。

---

## 改动 2 — SignalCompare 对比卡片新增命名区块

**位置：** `SignalCompare()` 内两张对比卡片，各卡片 `<Pill>` 下方、现有 mono 小标签上方

**方案（方案 B）：** 新增命名 + 描述文字，保留原有 mono 小标签不动。

左卡（枫连）新增：
- 标题：`透明传输 (Transparent Pass-through)`
- 副文字：`完整透传系统提示词，保留 200k 全量上下文`

右卡（其他中转）新增：
- 标题：`黑箱阉割 (Opaque Modification)`
- 副文字：`悄悄替换廉价模型，强制截断 System Prompt 导致逻辑崩坏`

**样式：** 标题 `fontSize: 14, fontWeight: 600`，副文字 `fontSize: 12, color: var(--text-2)`，两者之间 `marginBottom: 10` 与下方 mono 标签分隔。

---

## 改动 3 — FAQ 文案全量替换

**位置：** `Faq()` 组件内的 `items` 数组 + `<h2>` 标题

**h2：** `预先回答几个怀疑。` → `常见FAQ`

**5 条问答替换为：**

1. **如何验证模型响应的真实性？**  
   我们为每一笔请求生成唯一的 Audit ID。你可以在控制台中通过该 ID 追溯完整的哈希记录，包含上行 model 字段、max_tokens 参数及 system prompt 长度。我们承诺：若发现单次模型指纹（Fingerprint）不一致，补偿当月全额费用。

2. **中转链路如何实现比直连更低的延迟？**  
   我们在全球核心节点部署了 BGP 最佳路径优化与 Anycast 网络。通过枫连专线绕过公网拥塞，直接对接 Anthropic 骨干网边缘。对于国内开发者，我们通过 CN2/GIA 极速链路将首字响应（TTFT）优化至毫秒级，有效规避了公网直连的丢包与抖动。

3. **Anthropic 发布新模型后，多久可以接入？**  
   通常在官方发布后的 4 小时内完成全节点上架。

4. **是否兼容现有的 OpenAI / Anthropic 生态？**  
   枫连完全兼容 OpenAI 格式接口与 Anthropic 原生格式。无论是直接调用 LangChain、LlamaIndex，还是使用 Cursor、NextChat 等客户端，只需修改 BASE_URL 即可无缝切换。

5. **是否支持企业财务合规报销？**  
   支持。我们提供正式企业增值税普通发票，类目可选"信息技术服务"或"软件服务"。针对团队用户，我们支持按月度导出详细账单流水（Consumption Report），满足企业级审计与支出凭证需求。

---

## 改动 4 — FAQ 宽度对齐

**位置：** `Faq()` 内层容器 div

**方案：** `maxWidth: 880` → `maxWidth: 1216`，与 Hero、PromiseGrid、ModelsTable 等其他区块保持一致。

---

## 影响范围

- 仅涉及 `frontend/src/pages/marketing/Landing.jsx`
- 纯展示层改动，无后端、无路由、无状态逻辑变化
- 无需新增组件，无需修改 `primitives.jsx` 或 CSS token
