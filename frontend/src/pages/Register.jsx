import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { LogoMark } from "../components/primitives.jsx";
import { api, session } from "../lib/api.js";

export default function Register() {
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", name: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api("/api/console/register", {
        method: "POST",
        body: { email: form.email.trim(), name: form.name.trim(), password: form.password },
      });
      session.save(r.user, r.session);
      nav("/dashboard", { replace: true });
    } catch (err) {
      const map = {
        email_exists: "该邮箱已注册，换一个或直接登录。",
        weak_password: "密码至少 6 位。",
        invalid_email: "邮箱格式不正确。",
        missing_fields: "请填写所有字段。",
      };
      setError(map[err.data?.error] || err.message || "注册失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="创建账户"
      sub={<>已有账户？<Link to="/login" style={{ color: "var(--clay-press)" }}>直接登录 →</Link></>}
    >
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="邮箱">
          <input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} style={inputStyle}/>
        </Field>
        <Field label="名称 (可选)">
          <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="如何称呼你" style={inputStyle}/>
        </Field>
        <Field label="密码">
          <input type="password" required minLength={6} value={form.password} onChange={(e) => set("password", e.target.value)} style={inputStyle}/>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
            至少 6 位。我们只用 SHA-256 保存。
          </div>
        </Field>
        {error && (
          <div style={errorBox}>{error}</div>
        )}
        <button type="submit" disabled={busy} style={{
          padding: "12px 18px",
          background: busy ? "var(--btn-disabled-bg)" : "var(--clay)",
          color: busy ? "var(--btn-disabled-fg)" : "var(--on-clay)", border: "none", borderRadius: 8,
          fontSize: 14, fontWeight: 500,
          cursor: busy ? "wait" : "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          {busy && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }}/>}
          {busy ? "注册中…" : "注册 →"}
        </button>
      </form>
    </AuthShell>
  );
}

export function AuthShell({ title, sub, children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, position: "relative" }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "url(/assets/grid-tile.svg)",
        backgroundSize: "40px 40px",
        opacity: 0.5, pointerEvents: "none",
      }}/>
      <div style={{
        position: "relative", width: "100%", maxWidth: 420,
        background: "var(--surface-2)", border: "1px solid var(--border)",
        borderRadius: 12, padding: 40,
        boxShadow: "var(--shadow-pop)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <LogoMark size={36}/>
          <div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 600 }}>同源</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", color: "var(--text-3)" }}>TONGYUAN · SAME SOURCE</div>
          </div>
        </div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 600, letterSpacing: "-0.015em", margin: "0 0 8px" }}>{title}</h1>
        <p style={{ fontSize: 14, color: "var(--text-2)", margin: "0 0 28px" }}>{sub}</p>
        {children}
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <Link to="/" style={{ fontSize: 13, color: "var(--text-2)" }}>← 返回首页</Link>
        </div>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

export const inputStyle = {
  width: "100%", boxSizing: "border-box",
  padding: "10px 12px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--surface-2)",
  color: "var(--text)",
  fontSize: 14,
};

export const errorBox = {
  background: "var(--err-soft)", color: "var(--err-text)",
  padding: "10px 14px", borderRadius: 6,
  fontSize: 13, borderLeft: "2px solid var(--err)",
};
