import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api.js";
import { AuthShell, Field, inputStyle, errorBox } from "./Register.jsx";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const nav = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (password !== confirm) { setError("两次输入的密码不一致"); return; }
    setBusy(true); setError(null);
    try {
      await api("/api/console/reset", { method: "POST", body: { token, password } });
      setDone(true);
      setTimeout(() => nav("/login", { replace: true }), 2500);
    } catch (err) {
      const map = {
        invalid_or_expired_token: "链接无效或已过期，请重新申请。",
        weak_password: "密码至少 6 位。",
      };
      setError(map[err.data?.error] || err.message || "重置失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="链接无效" sub={<Link to="/forgot" style={{ color: "var(--clay-press)" }}>重新申请 →</Link>}>
        <div style={{ ...errorBox, textAlign: "center" }}>链接缺少 token 参数，请从邮件中重新点击链接。</div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="密码已重置" sub={<Link to="/login" style={{ color: "var(--clay-press)" }}>立即登录 →</Link>}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 0" }}>
          <CheckCircle2 size={40} style={{ color: "var(--ok)" }} />
          <div style={{ fontSize: 14, color: "var(--text-2)", textAlign: "center" }}>
            密码重置成功，正在跳转到登录页…
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="重置密码"
      sub={<>想起来了？<Link to="/login" style={{ color: "var(--clay-press)" }}>返回登录 →</Link></>}
    >
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="新密码">
          <input
            type="password" required minLength={6}
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 6 位" style={inputStyle}
          />
        </Field>
        <Field label="确认新密码">
          <input
            type="password" required minLength={6}
            value={confirm} onChange={(e) => setConfirm(e.target.value)}
            placeholder="再输入一次" style={inputStyle}
          />
        </Field>
        {error && <div style={errorBox}>{error}</div>}
        <button type="submit" disabled={busy} style={{
          padding: "12px 18px",
          background: busy ? "var(--btn-disabled-bg)" : "var(--clay)",
          color: busy ? "var(--btn-disabled-fg)" : "var(--on-clay)",
          border: "none", borderRadius: 8,
          fontSize: 14, fontWeight: 500,
          cursor: busy ? "wait" : "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          {busy && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
          {busy ? "重置中…" : "确认重置 →"}
        </button>
      </form>
    </AuthShell>
  );
}
