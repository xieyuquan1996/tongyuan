import { useState, useEffect } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { Check, Loader2, Sun, Moon, X } from "lucide-react";
import { api, session, logout } from "../../lib/api.js";
import { PageHeader } from "../../components/dashboard-widgets.jsx";
import { useTheme } from "../../lib/theme.jsx";

export default function Settings() {
  const { user } = useOutletContext();
  const nav = useNavigate();
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState({
    name: user.name || "",
    company: user.company || "",
    phone: user.phone || "",
    notify_email: !!user.notify_email,
    notify_browser: !!user.notify_browser,
  });
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState({ profile: false, password: false });
  const [toast, setToast] = useState(null);
  const [showDeactivate, setShowDeactivate] = useState(false);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  async function saveProfile(e) {
    e.preventDefault();
    setBusy({ ...busy, profile: true });
    try {
      const r = await api("/api/console/profile", { method: "PATCH", body: profile });
      session.save(r, JSON.parse(localStorage.getItem("ty.session") || "{}"));
      setToast({ tone: "ok", text: "资料已更新" });
    } catch (err) {
      setToast({ tone: "err", text: err.message || "保存失败" });
    } finally { setBusy({ ...busy, profile: false }); }
  }

  async function savePassword(e) {
    e.preventDefault();
    if (pwd.next !== pwd.confirm) { setToast({ tone: "err", text: "两次输入的新密码不一致" }); return; }
    setBusy({ ...busy, password: true });
    try {
      await api("/api/console/password", { method: "POST", body: { current: pwd.current, next: pwd.next } });
      setPwd({ current: "", next: "", confirm: "" });
      setToast({ tone: "ok", text: "密码已修改" });
    } catch (err) {
      const map = { wrong_password: "当前密码不正确", weak_password: "新密码至少 6 位" };
      setToast({ tone: "err", text: map[err.data?.error] || err.message || "修改失败" });
    } finally { setBusy({ ...busy, password: false }); }
  }

  return (
    <div>
      <PageHeader title="账户设置"/>

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 30,
          background: toast.tone === "ok" ? "var(--ok-soft)" : "var(--err-soft)",
          color: toast.tone === "ok" ? "var(--ok-text)" : "var(--err-text)",
          padding: "10px 16px", borderRadius: 8,
          fontSize: 13, borderLeft: `2px solid ${toast.tone === "ok" ? "var(--ok)" : "var(--err)"}`,
          boxShadow: "var(--shadow-pop)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          {toast.tone === "ok" && <Check size={14}/>}{toast.text}
        </div>
      )}

      {/* Profile */}
      <form onSubmit={saveProfile} style={card}>
        <SectionTitle>个人资料</SectionTitle>
        <Row>
          <Field label="邮箱">
            <input value={user.email} disabled style={{ ...ctrl, background: "var(--surface-3)", color: "var(--text-3)" }}/>
            <Hint>邮箱不可修改。如需迁移，请联系支持。</Hint>
          </Field>
          <Field label="名称">
            <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} style={ctrl}/>
          </Field>
        </Row>
        <Row>
          <Field label="公司 / 团队">
            <input value={profile.company} onChange={(e) => setProfile({ ...profile, company: e.target.value })} style={ctrl}/>
          </Field>
          <Field label="联系电话">
            <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} style={ctrl}/>
          </Field>
        </Row>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button type="submit" disabled={busy.profile} style={ctaBtn}>
            {busy.profile && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }}/>}
            保存资料
          </button>
        </div>
      </form>

      {/* Preferences */}
      <div style={card}>
        <SectionTitle>偏好</SectionTitle>
        <Row>
          <Field label="主题">
            <div style={{ display: "flex", gap: 8 }}>
              <ThemeChoice active={theme === "light"} onClick={() => setTheme("light")} icon={Sun} label="浅色"/>
              <ThemeChoice active={theme === "dark"}  onClick={() => setTheme("dark")}  icon={Moon} label="深色"/>
            </div>
          </Field>
          <Field label="通知渠道">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Checkbox checked={profile.notify_email} onChange={(v) => setProfile({ ...profile, notify_email: v })}>邮件通知</Checkbox>
              <Checkbox checked={profile.notify_browser} onChange={(v) => setProfile({ ...profile, notify_browser: v })}>浏览器推送</Checkbox>
            </div>
          </Field>
        </Row>
      </div>

      {/* Password */}
      <form onSubmit={savePassword} style={card}>
        <SectionTitle>修改密码</SectionTitle>
        <Row>
          <Field label="当前密码">
            <input type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} style={ctrl} required/>
          </Field>
          <div/>
        </Row>
        <Row>
          <Field label="新密码">
            <input type="password" minLength={6} value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} style={ctrl} required/>
          </Field>
          <Field label="确认新密码">
            <input type="password" minLength={6} value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} style={ctrl} required/>
          </Field>
        </Row>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button type="submit" disabled={busy.password} style={ctaBtn}>
            {busy.password && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }}/>}
            修改密码
          </button>
        </div>
      </form>

      {/* Danger zone */}
      <div style={{ ...card, borderColor: "var(--err)" }}>
        <SectionTitle danger>危险操作</SectionTitle>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>导出所有数据</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>下载账单 / 审计日志 / API 密钥元数据的 JSON 归档。</div>
          </div>
          <button style={{ ...ghostBtn }}>申请导出</button>
        </div>
        <div style={{ height: 1, background: "var(--divider)", margin: "16px 0" }}/>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, color: "var(--err)" }}>注销账户</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>注销后所有密钥立即失效，账单按比例结算。不可恢复。</div>
          </div>
          <button onClick={() => setShowDeactivate(true)} style={{ ...ghostBtn, borderColor: "var(--err)", color: "var(--err)" }}>注销账户</button>
        </div>
      </div>
      {showDeactivate && (
        <>
          <div onClick={() => setShowDeactivate(false)} style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 30 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            width: 440, maxWidth: "calc(100vw - 32px)", zIndex: 31,
            background: "var(--surface-2)", borderRadius: 12, padding: 28,
            boxShadow: "var(--shadow-modal)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--err)" }}>注销账户</h3>
              <button onClick={() => setShowDeactivate(false)} style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", display: "flex" }}><X size={16}/></button>
            </div>
            <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6, margin: "0 0 20px" }}>
              注销后所有 API 密钥立即失效，账单按比例结算。此操作<strong>不可恢复</strong>。
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowDeactivate(false)} style={ghostBtn}>取消</button>
              <button onClick={async () => {
                try { await logout(); nav("/login", { replace: true }); }
                catch (err) { setToast({ tone: "err", text: err.message || "注销失败" }); setShowDeactivate(false); }
              }} style={{ ...ctaBtn, background: "var(--err)" }}>确认注销</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SectionTitle({ children, danger }) {
  return (
    <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 16px", color: danger ? "var(--err)" : "var(--text)" }}>
      {children}
    </h3>
  );
}
function Row({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 12 }}>{children}</div>;
}
function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}
function Hint({ children }) {
  return <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>{children}</div>;
}
function Checkbox({ checked, onChange, children }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "var(--clay)" }}/>
      {children}
    </label>
  );
}
function ThemeChoice({ active, onClick, icon: Icon, label }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "8px 14px",
      border: active ? "1px solid var(--clay)" : "1px solid var(--border)",
      background: active ? "var(--clay-soft)" : "transparent",
      color: "var(--text)", borderRadius: 6, cursor: "pointer", fontSize: 13,
    }}>
      <Icon size={14}/>
      {label}
    </button>
  );
}

const card = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 28, marginBottom: 16 };
const ctrl = { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-2)", color: "var(--text)", fontSize: 14 };
const ctaBtn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", background: "var(--clay)", color: "var(--on-clay)", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer" };
const ghostBtn = { padding: "8px 14px", background: "transparent", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 6, fontSize: 13, cursor: "pointer" };
