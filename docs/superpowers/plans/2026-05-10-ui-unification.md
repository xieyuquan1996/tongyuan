# UI 统一化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared Input, Select, FormField, Toast, Banner components to primitives.jsx and enforce UI consistency via CLAUDE.md rules.

**Architecture:** Extend the existing `primitives.jsx` single-file component library with form controls and feedback components. Toast uses React Context (ToastProvider + useToast hook) wired into App.jsx. All components use CSS variables from tokens.css for automatic light/dark theme support.

**Tech Stack:** React 18, vitest + jsdom + @testing-library/react, CSS variables (no CSS-in-JS library)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `frontend/src/components/primitives.jsx` | Add Input, Select, FormField, Banner, export ErrorBox alias |
| Create | `frontend/src/components/Toast.jsx` | ToastProvider, useToast, ToastContainer rendering |
| Create | `frontend/src/components/primitives.test.jsx` | Tests for Input, Select, FormField, Banner |
| Create | `frontend/src/components/Toast.test.jsx` | Tests for Toast system |
| Modify | `frontend/src/App.jsx` | Wrap with ToastProvider |
| Modify | `CLAUDE.md` | Add Frontend UI Rules section |

---

### Task 1: Input Component

**Files:**
- Create: `frontend/src/components/primitives.test.jsx`
- Modify: `frontend/src/components/primitives.jsx`

- [ ] **Step 1: Write failing tests for Input**

```jsx
// frontend/src/components/primitives.test.jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "./primitives.jsx";

describe("Input", () => {
  it("renders with value and responds to change", () => {
    const onChange = vi.fn();
    render(<Input value="hello" onChange={onChange} />);
    const input = screen.getByDisplayValue("hello");
    fireEvent.change(input, { target: { value: "world" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("renders placeholder", () => {
    render(<Input value="" onChange={() => {}} placeholder="输入邮箱" />);
    expect(screen.getByPlaceholderText("输入邮箱")).toBeInTheDocument();
  });

  it("applies disabled state", () => {
    render(<Input value="" onChange={() => {}} disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("passes type prop to native input", () => {
    render(<Input value="" onChange={() => {}} type="email" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("type", "email");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/primitives.test.jsx`
Expected: FAIL — `Input` is not exported from primitives.jsx

- [ ] **Step 3: Implement Input component**

Add to `frontend/src/components/primitives.jsx`:

```jsx
export function Input({
  type = "text",
  size = "md",
  style,
  ...rest
}) {
  const [focused, setFocused] = useState(false);
  const sizes = {
    sm: { padding: "6px 10px", fontSize: 13, borderRadius: "var(--radius-sm)" },
    md: { padding: "10px 14px", fontSize: 14, borderRadius: "var(--radius-md)" },
    lg: { padding: "12px 16px", fontSize: 15, borderRadius: "var(--radius-md)" },
  };
  return (
    <input
      type={type}
      {...rest}
      onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: `1px solid ${focused ? "var(--clay)" : "var(--border)"}`,
        background: "var(--surface-2)",
        color: "var(--text)",
        fontFamily: "var(--font-sans)",
        outline: "none",
        transition: `border-color var(--dur) var(--ease)`,
        opacity: rest.disabled ? 0.5 : 1,
        cursor: rest.disabled ? "not-allowed" : "text",
        ...sizes[size],
        ...style,
      }}
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/primitives.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/primitives.jsx frontend/src/components/primitives.test.jsx
git commit -m "feat(frontend): add Input component to primitives"
```

---

### Task 2: Select Component

**Files:**
- Modify: `frontend/src/components/primitives.test.jsx`
- Modify: `frontend/src/components/primitives.jsx`

- [ ] **Step 1: Write failing tests for Select**

Append to `frontend/src/components/primitives.test.jsx`:

```jsx
import { Input, Select } from "./primitives.jsx";

describe("Select", () => {
  const options = [
    { label: "Claude 3.5", value: "claude-3.5" },
    { label: "Claude 4", value: "claude-4" },
  ];

  it("renders options", () => {
    render(<Select value="" onChange={() => {}} options={options} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("Claude 3.5")).toBeInTheDocument();
    expect(screen.getByText("Claude 4")).toBeInTheDocument();
  });

  it("renders placeholder as disabled first option", () => {
    render(<Select value="" onChange={() => {}} options={options} placeholder="选择模型" />);
    const placeholder = screen.getByText("选择模型");
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).toBeDisabled();
  });

  it("responds to value change", () => {
    const onChange = vi.fn();
    render(<Select value="" onChange={onChange} options={options} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "claude-4" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("applies disabled state", () => {
    render(<Select value="" onChange={() => {}} options={options} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/primitives.test.jsx`
Expected: FAIL — `Select` is not exported

- [ ] **Step 3: Implement Select component**

Add to `frontend/src/components/primitives.jsx`:

```jsx
export function Select({
  options = [],
  placeholder,
  size = "md",
  style,
  ...rest
}) {
  const [focused, setFocused] = useState(false);
  const sizes = {
    sm: { padding: "6px 10px", fontSize: 13, borderRadius: "var(--radius-sm)" },
    md: { padding: "10px 14px", fontSize: 14, borderRadius: "var(--radius-md)" },
    lg: { padding: "12px 16px", fontSize: 15, borderRadius: "var(--radius-md)" },
  };
  return (
    <select
      {...rest}
      onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: `1px solid ${focused ? "var(--clay)" : "var(--border)"}`,
        background: "var(--surface-2)",
        color: "var(--text)",
        fontFamily: "var(--font-sans)",
        outline: "none",
        appearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237A736A' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 12px center",
        paddingRight: 36,
        transition: `border-color var(--dur) var(--ease)`,
        opacity: rest.disabled ? 0.5 : 1,
        cursor: rest.disabled ? "not-allowed" : "pointer",
        ...sizes[size],
        ...style,
      }}
    >
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/primitives.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/primitives.jsx frontend/src/components/primitives.test.jsx
git commit -m "feat(frontend): add Select component to primitives"
```

---

### Task 3: FormField Component

**Files:**
- Modify: `frontend/src/components/primitives.test.jsx`
- Modify: `frontend/src/components/primitives.jsx`

- [ ] **Step 1: Write failing tests for FormField**

Append to `frontend/src/components/primitives.test.jsx`:

```jsx
import { Input, Select, FormField } from "./primitives.jsx";

describe("FormField", () => {
  it("renders label and children", () => {
    render(
      <FormField label="邮箱">
        <Input value="" onChange={() => {}} />
      </FormField>
    );
    expect(screen.getByText("邮箱")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("displays error message when error prop is set", () => {
    render(
      <FormField label="密码" error="密码至少 6 位">
        <Input value="" onChange={() => {}} type="password" />
      </FormField>
    );
    expect(screen.getByText("密码至少 6 位")).toBeInTheDocument();
  });

  it("does not display error element when error is null", () => {
    render(
      <FormField label="名称" error={null}>
        <Input value="" onChange={() => {}} />
      </FormField>
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/primitives.test.jsx`
Expected: FAIL — `FormField` is not exported

- [ ] **Step 3: Implement FormField component**

Add to `frontend/src/components/primitives.jsx`:

```jsx
export function FormField({ label, error, children }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.04em",
        color: "var(--text-2)",
        marginBottom: 6,
      }}>
        {label}
      </div>
      {children}
      {error && (
        <div role="alert" style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--err-text)",
          marginTop: 4,
        }}>
          {error}
        </div>
      )}
    </label>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/primitives.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/primitives.jsx frontend/src/components/primitives.test.jsx
git commit -m "feat(frontend): add FormField component to primitives"
```

---

### Task 4: Banner Component + ErrorBox Alias

**Files:**
- Modify: `frontend/src/components/primitives.test.jsx`
- Modify: `frontend/src/components/primitives.jsx`

- [ ] **Step 1: Write failing tests for Banner**

Append to `frontend/src/components/primitives.test.jsx`:

```jsx
import { Input, Select, FormField, Banner } from "./primitives.jsx";

describe("Banner", () => {
  it("renders children with default info tone", () => {
    render(<Banner>操作已完成</Banner>);
    expect(screen.getByText("操作已完成")).toBeInTheDocument();
  });

  it("renders with err tone", () => {
    render(<Banner tone="err">请求失败</Banner>);
    expect(screen.getByText("请求失败")).toBeInTheDocument();
  });

  it("calls onDismiss when close button is clicked", () => {
    const onDismiss = vi.fn();
    render(<Banner tone="warn" dismissible onDismiss={onDismiss}>警告</Banner>);
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not show close button when dismissible is false", () => {
    render(<Banner tone="ok">成功</Banner>);
    expect(screen.queryByRole("button", { name: "关闭" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/primitives.test.jsx`
Expected: FAIL — `Banner` is not exported

- [ ] **Step 3: Implement Banner component and update ErrorBox**

Add Banner to `frontend/src/components/primitives.jsx` and change ErrorBox to use it:

```jsx
export function Banner({ tone = "info", dismissible = false, onDismiss, children }) {
  const toneMap = {
    ok: { bg: "var(--ok-soft)", fg: "var(--ok-text)", accent: "var(--ok)" },
    warn: { bg: "var(--warn-soft)", fg: "var(--warn-text)", accent: "var(--warn)" },
    err: { bg: "var(--err-soft)", fg: "var(--err-text)", accent: "var(--err)" },
    info: { bg: "var(--info-soft)", fg: "var(--info-text)", accent: "var(--info)" },
  };
  const t = toneMap[tone] || toneMap.info;
  return (
    <div style={{
      background: t.bg,
      color: t.fg,
      padding: "12px 16px",
      borderRadius: "var(--radius-md)",
      borderLeft: `2px solid ${t.accent}`,
      fontSize: 13,
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
    }}>
      <div style={{ flex: 1 }}>{children}</div>
      {dismissible && (
        <button
          onClick={onDismiss}
          aria-label="关闭"
          style={{
            background: "none",
            border: "none",
            color: t.fg,
            cursor: "pointer",
            padding: 0,
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

export function ErrorBox({ error }) {
  return <Banner tone="err">{error?.message || String(error)}</Banner>;
}
```

Remove the old `ErrorBox` implementation (the one with inline styles).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/primitives.test.jsx`
Expected: PASS

- [ ] **Step 5: Run full frontend test suite to verify ErrorBox alias doesn't break anything**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/primitives.jsx frontend/src/components/primitives.test.jsx
git commit -m "feat(frontend): add Banner component, refactor ErrorBox as alias"
```

---

### Task 5: Toast System

**Files:**
- Create: `frontend/src/components/Toast.jsx`
- Create: `frontend/src/components/Toast.test.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Write failing tests for Toast**

```jsx
// frontend/src/components/Toast.test.jsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toast.jsx";

function TestHarness() {
  const { toast } = useToast();
  return (
    <div>
      <button onClick={() => toast("保存成功", { tone: "ok" })}>trigger-ok</button>
      <button onClick={() => toast("请求失败", { tone: "err" })}>trigger-err</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <ToastProvider>
      <TestHarness />
    </ToastProvider>
  );
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("Toast", () => {
  it("shows toast message after trigger", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("trigger-ok"));
    expect(screen.getByText("保存成功")).toBeInTheDocument();
  });

  it("auto-dismisses after duration", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("trigger-ok"));
    expect(screen.getByText("保存成功")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3100); });
    expect(screen.queryByText("保存成功")).not.toBeInTheDocument();
  });

  it("can be manually dismissed via close button", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("trigger-err"));
    expect(screen.getByText("请求失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByText("请求失败")).not.toBeInTheDocument();
  });

  it("stacks multiple toasts", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("trigger-ok"));
    fireEvent.click(screen.getByText("trigger-err"));
    expect(screen.getByText("保存成功")).toBeInTheDocument();
    expect(screen.getByText("请求失败")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/Toast.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Toast system**

```jsx
// frontend/src/components/Toast.jsx
import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, options = {}) => {
    const id = ++toastId;
    const { tone = "info", duration = 3000 } = options;
    setToasts((prev) => [{ id, message, tone, duration }, ...prev]);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function ToastContainer({ toasts, dismiss }) {
  return (
    <div style={{
      position: "fixed",
      top: 16,
      right: 16,
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      pointerEvents: "none",
    }}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const timerRef = useRef(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    timerRef.current = setTimeout(onDismiss, toast.duration);
    return () => clearTimeout(timerRef.current);
  }, [paused, toast.duration, onDismiss]);

  const accentMap = {
    ok: "var(--ok)",
    err: "var(--err)",
    info: "var(--info)",
  };

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        pointerEvents: "auto",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderLeft: `4px solid ${accentMap[toast.tone] || accentMap.info}`,
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-pop)",
        padding: "12px 16px",
        maxWidth: 360,
        fontSize: 14,
        color: "var(--text)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        animation: "fadeIn 180ms var(--ease)",
      }}
    >
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={onDismiss}
        aria-label="关闭"
        style={{
          background: "none",
          border: "none",
          color: "var(--text-3)",
          cursor: "pointer",
          padding: 0,
          fontSize: 16,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/Toast.test.jsx`
Expected: PASS

- [ ] **Step 5: Wire ToastProvider into App.jsx**

In `frontend/src/App.jsx`, add import and wrap:

```jsx
import { ToastProvider } from "./components/Toast.jsx";

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <CommandPalette />
        <Routes>
          {/* ... existing routes unchanged ... */}
        </Routes>
      </ToastProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 6: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Toast.jsx frontend/src/components/Toast.test.jsx frontend/src/App.jsx
git commit -m "feat(frontend): add Toast system with ToastProvider and useToast hook"
```

---

### Task 6: Update CLAUDE.md with Frontend UI Rules

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Append Frontend UI Rules section to CLAUDE.md**

Add the following at the end of `CLAUDE.md`:

```markdown
## Frontend UI Rules

### 组件使用

- 所有表单输入使用 `Input` 组件（from `primitives.jsx`），禁止内联 style 写 `<input>`
- 所有下拉选择使用 `Select` 组件
- 表单区域必须用 `FormField` 包裹（提供 label + error 展示）
- 操作成功/信息提示用 `useToast()`（from `Toast.jsx`），错误/警告用 `Banner` 内嵌页面
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

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add Frontend UI Rules section to CLAUDE.md"
```

---

### Task 7: Verify Full Suite & Final Check

- [ ] **Step 1: Run full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS (including existing Keys.test.jsx, Alerts.test.jsx, etc.)

- [ ] **Step 2: Run typecheck (if applicable)**

Run: `cd frontend && npx tsc --noEmit 2>/dev/null || echo "no tsconfig"`
Expected: No errors (or no tsconfig for JSX-only project)

- [ ] **Step 3: Visual smoke test**

Run: `cd frontend && npm run dev`
Open browser, verify:
- Login/Register pages still render correctly
- Dashboard pages still work
- Toggle dark mode — all components respond to theme change
