# 前端 UI 统一化设计

## 目标

解决前端页面 UI 不一致问题，通过扩充共享组件库 + CLAUDE.md 规则约束，确保 AI 生成新页面时风格统一、深浅主题自动适配。

## 范围

- 新增组件：Select、Input、FormField、Toast、Banner
- 扩展 CLAUDE.md：追加前端 UI 规则章节
- 不改动现有 tokens.css 和 Button/Pill 等已有组件

## 设计原则

1. **语义 token 唯一来源** — 组件内禁止 hex/rgba 字面量，全部引用 `tokens.css` 中的 CSS 变量
2. **深浅自动适配** — 依赖 `:root[data-theme="dark"]` token 覆盖，组件无需额外 dark mode 逻辑
3. **原生优先** — Select 使用原生 `<select>` 包装，保持可访问性和移动端兼容
4. **单文件组件库** — 继续在 `primitives.jsx` 中扩展，当前体量合理

## 组件规格

### Input

文本输入框，统一替代各页面散落的 `inputStyle`。

```
Props:
  type: string          — "text" | "email" | "password" | "number" 等，默认 "text"
  value: string
  onChange: function
  placeholder: string
  size: "sm" | "md" | "lg"  — 默认 "md"
  disabled: boolean
  ...rest               — 透传给原生 <input>
```

样式规格：
- 背景：`--surface-2`
- 边框：`1px solid var(--border)`，focus 时 `var(--clay)`
- 圆角：`--radius-md`（8px）
- 字体：`--font-sans`，size sm=13px / md=14px / lg=15px
- padding：sm=`6px 10px` / md=`10px 14px` / lg=`12px 16px`
- disabled：opacity 0.5，cursor not-allowed
- transition：border-color `--dur` `--ease`

### Select

下拉选择框，原生 `<select>` 包装。

```
Props:
  value: string
  onChange: function
  options: { label: string, value: string }[]
  placeholder: string   — 显示为第一个 disabled option
  size: "sm" | "md" | "lg"  — 默认 "md"
  disabled: boolean
```

样式规格：
- 与 Input 完全对齐（背景、边框、圆角、字体、padding）
- 右侧自定义 chevron 图标（用 CSS border trick 或 lucide-react ChevronDown）
- `appearance: none` 去除原生箭头

### FormField

label + 输入控件 + 错误提示的组合容器。

```
Props:
  label: string
  error: string | null  — 非空时显示红色错误文本
  children: ReactNode   — Input / Select / 其他控件
```

样式规格：
- label：`--font-mono`，11px，`--text-2`，`letter-spacing: 0.04em`，`margin-bottom: 6px`
- error：`--err-text`，12px，`--font-mono`，`margin-top: 4px`
- 当 error 存在时，子控件边框变为 `var(--err)`

### Toast

全局轻量提示，通过 Context + Hook 使用。

```
API:
  <ToastProvider>       — 包裹在 App 顶层
  useToast()            — 返回 { toast(message, options?) }

options:
  tone: "ok" | "err" | "info"  — 默认 "info"
  duration: number             — 毫秒，默认 3000
```

行为规格：
- 位置：视口右上角，距顶 16px 距右 16px
- 堆叠：新 toast 在上方，旧的下移
- 动画：fadeIn + translateY 进入，fadeOut 退出
- 自动消失：默认 3 秒，hover 时暂停计时
- 手动关闭：右侧 × 按钮

样式规格：
- 背景：`--surface-2`
- 边框：`1px solid var(--border)`
- 阴影：`--shadow-pop`
- 圆角：`--radius-md`
- 左侧 4px 色条：ok=`--ok`，err=`--err`，info=`--info`
- 文字：`--text`，14px
- 最大宽度：360px
- z-index：9999

### Banner

内嵌页面的提示条，替代现有 `ErrorBox`。

```
Props:
  tone: "ok" | "warn" | "err" | "info"  — 默认 "info"
  dismissible: boolean                   — 是否显示关闭按钮，默认 false
  onDismiss: function                    — 关闭回调
  children: ReactNode                    — 提示内容
```

样式规格：
- 背景：`--{tone}-soft`
- 文字：`--{tone}-text`
- 左侧边条：`2px solid var(--{tone})`
- 圆角：`--radius-md`
- padding：`12px 16px`
- 关闭按钮：右上角，`--{tone}-text` 颜色的 × 图标

`ErrorBox` 保留为向后兼容的别名：`ErrorBox = (props) => <Banner tone="err">{props.error}</Banner>`

## CLAUDE.md 新增章节

追加到 CLAUDE.md 末尾：

```markdown
## Frontend UI Rules

### 组件使用

- 所有表单输入使用 `Input` 组件，禁止内联 style 写 `<input>`
- 所有下拉选择使用 `Select` 组件
- 表单区域必须用 `FormField` 包裹（提供 label + error 展示）
- 操作成功/信息提示用 `useToast()`，错误/警告用 `Banner` 内嵌页面
- 按钮使用 `Button` 组件，主操作 `variant="primary"`，次要 `variant="secondary"`

### 样式规则

- 颜色只用 `tokens.css` 中的语义 CSS 变量，禁止写 hex/rgba 字面量
- 间距遵循 8px 网格：8, 16, 24, 32, 48
- 圆角使用 token：`--radius-sm`(4px) / `--radius-md`(8px) / `--radius-lg`(12px)
- 字体只用 `--font-serif` / `--font-sans` / `--font-mono`
- 深浅主题通过 token 自动适配，组件内不写任何 dark mode 条件判断

### 禁止事项

- 禁止在页面内重新定义 Box / Card / Row 等局部组件，使用 primitives.jsx 中的共享组件
- 禁止 `style={{ color: "#xxx" }}` 等硬编码颜色
- 禁止绕过 FormField 直接裸写 label + input
```

## 深浅主题适配策略

无需额外工作。`tokens.css` 已定义完整的 light/dark 双套语义变量，`ThemeProvider` 通过 `data-theme` 属性切换。只要组件严格使用语义变量：

- `--surface-2` 在 light 下是 `#FDFCF8`，dark 下是 `#1E1A15`
- `--border` 在 light 下是 `rgba(26,24,20,0.12)`，dark 下是 `rgba(239,233,220,0.12)`
- `--err-soft` / `--err-text` 等状态色在 dark 下都有对应的高对比度值

组件代码零 dark mode 逻辑，全靠 CSS 变量自动响应。

## 测试策略

每个新组件需要对应的 component test（`primitives.test.jsx`）：

- Input：渲染、value 变化、disabled 态、size 变体
- Select：渲染 options、placeholder、value 变化、disabled
- FormField：渲染 label、显示 error、children 透传
- Toast：toast() 调用后出现、自动消失、手动关闭
- Banner：各 tone 渲染、dismissible 关闭回调

测试环境：vitest + jsdom + @testing-library/react，mock fetch 不需要（纯 UI 组件无网络请求）。

## 迁移计划

新组件就绪后，逐步替换现有页面中的重复实现：

1. `Register.jsx` 中的 `Field` / `inputStyle` → `FormField` + `Input`
2. `Login.jsx` 中的内联 input style → `Input`
3. `Status.jsx` 中的局部 `Box` / `Row` → 后续可提取，但不在本次范围
4. `ErrorBox` → 改为 `Banner tone="err"` 的别名
