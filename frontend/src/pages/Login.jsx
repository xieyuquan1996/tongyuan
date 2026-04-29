import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { login } from "../lib/api.js";
import { AuthShell, Field, inputStyle, errorBox } from "./Register.jsx";

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const from = loc.state?.from || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      nav(from, { replace: true });
    } catch (err) {
      if (err.data?.error === "account_locked") {
        setError(err.data.message || "账户已锁定，请稍后再试");
      } else if (err.status === 401) {
        setError("邮箱或密码错误");
      } else {
        setError(err.message || "登录失败");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="登录控制台"
      sub={<>
        还没有账户？<Link to="/register" style={{ color: "var(--clay-press)" }}>立即注册 →</Link>
      </>}
    >
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="邮箱">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle}/>
        </Field>
        <Field label="密码">
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle}/>
        </Field>
        {error && <div style={errorBox}>{error}</div>}
        <button type="submit" disabled={busy} style={{
          padding: "12px 18px",
          background: busy ? "var(--btn-disabled-bg)" : "var(--clay)",
          color: busy ? "var(--btn-disabled-fg)" : "var(--on-clay)", border: "none", borderRadius: 8,
          fontSize: 14, fontWeight: 500,
          cursor: busy ? "wait" : "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          {busy && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }}/>}
          {busy ? "正在登录…" : "登录 →"}
        </button>
        <div style={{ textAlign: "right", fontSize: 13 }}>
          <Link to="/forgot" style={{ color: "var(--text-2)" }}>忘记密码？</Link>
        </div>
      </form>
    </AuthShell>
  );
}
