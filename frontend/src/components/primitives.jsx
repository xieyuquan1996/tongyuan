import { useState } from "react";

export function Button({
  variant = "primary",
  size = "md",
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = useState(false);
  const base = {
    fontFamily: "var(--font-sans)",
    fontWeight: 500,
    border: "1px solid transparent",
    borderRadius: 8,
    cursor: "pointer",
    lineHeight: 1,
    transition: "background 180ms var(--ease), opacity 80ms var(--ease)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    textDecoration: "none",
  };
  const sizes = {
    sm: { padding: "6px 12px", fontSize: 13, borderRadius: 6 },
    md: { padding: "11px 18px", fontSize: 14 },
    lg: { padding: "14px 22px", fontSize: 15 },
  };
  const variants = {
    primary: { background: "var(--clay)", color: "var(--on-clay)" },
    secondary: {
      background: "transparent",
      color: "var(--text)",
      borderColor: "var(--border-strong)",
    },
    ghost: { background: "transparent", color: "var(--text)" },
    inverse: { background: "var(--surface-2)", color: "var(--text)" },
  };
  const hoverBg = {
    primary: "var(--clay-hover)",
    secondary: "var(--surface-3)",
    ghost: "var(--surface-3)",
    inverse: "var(--surface-3)",
  }[variant];
  const disabled = rest.disabled;
  return (
    <button
      {...rest}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...base,
        ...sizes[size],
        ...variants[variant],
        background: hover && !disabled ? hoverBg : variants[variant].background,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Pill({ tone = "default", dot, children, mono = true, style }) {
  const tones = {
    default: { bg: "var(--surface-2)", fg: "var(--text)", border: "var(--border)", dot: "var(--text-3)" },
    ok: { bg: "var(--ok-soft)", fg: "var(--ok-text)", border: "transparent", dot: "var(--ok)" },
    warn: { bg: "var(--warn-soft)", fg: "var(--warn-text)", border: "transparent", dot: "var(--warn)" },
    err: { bg: "var(--err-soft)", fg: "var(--err-text)", border: "transparent", dot: "var(--err)" },
    clay: { bg: "var(--clay-soft)", fg: "var(--clay-press)", border: "transparent", dot: "var(--clay)" },
    ink: { bg: "var(--surface-inverse)", fg: "var(--text-on-inverse)", border: "transparent", dot: "var(--clay)" },
  }[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        background: tones.bg,
        color: tones.fg,
        border: `1px solid ${tones.border}`,
        fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
        fontSize: 11,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: tones.dot }} />}
      {children}
    </span>
  );
}

export function LogoMark({ size = 28 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <circle cx="16" cy="16" r="14" fill="none" stroke="var(--clay)" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="6" fill="none" stroke="var(--clay)" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="1.5" fill="var(--clay)" />
    </svg>
  );
}

export function LogoLockup({ size = 28 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <LogoMark size={size} />
      <span
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: "-0.01em",
        }}
      >
        枫连
      </span>
    </div>
  );
}

export function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--clay-press)",
        marginBottom: 16,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 24,
          height: 1,
          background: "var(--clay)",
          verticalAlign: "middle",
          marginRight: 12,
        }}
      />
      {children}
    </div>
  );
}

export function Loading({ children = "加载中…" }) {
  return (
    <div
      style={{
        padding: 48,
        textAlign: "center",
        color: "var(--text-3)",
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 12,
          height: 12,
          border: "2px solid var(--border)",
          borderTopColor: "var(--clay)",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      />
      {children}
    </div>
  );
}

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
