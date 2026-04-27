import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api } from "../lib/api.js";
import { AuthShell, Field, inputStyle, errorBox } from "./Register.jsx";

export default function Forgot() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api("/api/console/forgot", { method: "POST", body: { email: email.trim() } });
      setSent(r.hint || "如果该邮箱已注册，我们已经发送了重置链接。");
    } catch (err) {
      setSent(err.message || "请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="找回密码"
      sub={<>想起来了？<Link to="/login" style={{ color: "var(--clay-press)" }}>返回登录 →</Link></>}
    >
      {sent ? (
        <div style={{
          background: "var(--ok-soft)", color: "var(--ok-text)",
          padding: "12px 14px", borderRadius: 6,
          fontSize: 13, borderLeft: "2px solid var(--ok)",
        }}>
          {sent}
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="注册邮箱">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle}/>
          </Field>
          <button type="submit" disabled={busy} style={{
            padding: "12px 18px",
            background: busy ? "var(--btn-disabled-bg)" : "var(--clay)",
            color: busy ? "var(--btn-disabled-fg)" : "var(--on-clay)", border: "none", borderRadius: 8,
            fontSize: 14, fontWeight: 500,
            cursor: busy ? "wait" : "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {busy && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }}/>}
            {busy ? "发送中…" : "发送重置链接 →"}
          </button>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
            出于安全考虑，我们不会告诉你邮箱是否存在。
          </div>
        </form>
      )}
    </AuthShell>
  );
}
