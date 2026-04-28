import { useState } from "react";
import { KeyRound, Plus, Trash2, RefreshCw } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/hooks.js";
import { Loading, ErrorBox } from "../../components/primitives.jsx";

const STATE_COLORS = {
  active:   { bg: "var(--ok-soft)",   text: "var(--ok-text)",   label: "活跃" },
  cooldown: { bg: "var(--warn-soft)", text: "var(--warn-text)", label: "冷却中" },
  disabled: { bg: "var(--surface-3)", text: "var(--text-3)",    label: "已禁用" },
};

export default function UpstreamKeys() {
  const { loading, data, error, reload } = useAsync(() => api("/api/admin/upstream-keys"), []);
  const [adding, setAdding] = useState(false);

  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  const keys = data.upstream_keys || [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 24, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>上游密钥</h1>
          <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
            Anthropic API Key 池 · {keys.length} 个 · 按优先级顺序尝试，失败自动切换
          </div>
        </div>
        <button onClick={() => setAdding(true)} style={addBtn}>
          <Plus size={14}/> 添加密钥
        </button>
      </div>

      {adding && <AddKeyForm onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />}

      {keys.length === 0 && !adding ? (
        <div style={{ textAlign: "center", padding: "64px 0", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 12 }}>
          <KeyRound size={32} style={{ marginBottom: 12, opacity: 0.4 }}/>
          <div>还没有上游密钥。点击"添加密钥"录入 Anthropic API Key。</div>
        </div>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-3)" }}>
                {["别名", "前缀", "优先级", "状态", "操作"].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k, i) => (
                <KeyRow key={k.id} row={k} last={i === keys.length - 1} onRefresh={reload} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KeyRow({ row, last, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const sc = STATE_COLORS[row.state] || STATE_COLORS.disabled;

  async function toggleState() {
    setBusy(true);
    const next = row.state === "active" ? "disabled" : "active";
    await api(`/api/admin/upstream-keys/${row.id}`, { method: "PATCH", body: { state: next } });
    onRefresh();
    setBusy(false);
  }

  async function remove() {
    if (!confirm(`删除上游密钥 "${row.alias}"？`)) return;
    setBusy(true);
    await api(`/api/admin/upstream-keys/${row.id}`, { method: "DELETE" });
    onRefresh();
    setBusy(false);
  }

  return (
    <tr style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
      <td style={{ ...td, fontWeight: 500 }}>{row.alias}</td>
      <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>{row.prefix}…</td>
      <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{row.priority ?? 0}</td>
      <td style={td}>
        <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, background: sc.bg, color: sc.text }}>
          {sc.label}
        </span>
        {row.state === "cooldown" && row.cooldown_until && (
          <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-3)" }}>
            至 {new Date(row.cooldown_until).toLocaleTimeString()}
          </span>
        )}
      </td>
      <td style={{ ...td, display: "flex", gap: 6 }}>
        <button onClick={toggleState} disabled={busy} title={row.state === "active" ? "禁用" : "启用"} style={iconBtn}>
          <RefreshCw size={13}/>
          {row.state === "active" ? "禁用" : "启用"}
        </button>
        <button onClick={remove} disabled={busy} title="删除" style={{ ...iconBtn, color: "var(--err)" }}>
          <Trash2 size={13}/>
        </button>
      </td>
    </tr>
  );
}

function AddKeyForm({ onDone, onCancel }) {
  const [alias, setAlias] = useState("");
  const [secret, setSecret] = useState("");
  const [priority, setPriority] = useState("0");
  const [baseUrl, setBaseUrl] = useState("https://api.anthropic.com");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!alias.trim() || !secret.trim()) { setErr("别名和密钥不能为空"); return; }
    setBusy(true);
    try {
      await api("/api/admin/upstream-keys", {
        method: "POST",
        body: { alias: alias.trim(), secret: secret.trim(), priority: parseInt(priority) || 0, ...(baseUrl.trim() ? { base_url: baseUrl.trim() } : {}) },
      });
      onDone();
    } catch (e) {
      setErr(e.message || "添加失败");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, background: "var(--surface-2)" }}>
      <div style={{ fontWeight: 600, marginBottom: 16 }}>添加上游密钥</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 80px", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>别名</label>
          <input value={alias} onChange={e => setAlias(e.target.value)} placeholder="如 key-1" style={inputStyle}/>
        </div>
        <div>
          <label style={labelStyle}>Anthropic API Key</label>
          <input value={secret} onChange={e => setSecret(e.target.value)} placeholder="sk-ant-..." type="password" style={inputStyle}/>
        </div>
        <div>
          <label style={labelStyle}>优先级</label>
          <input value={priority} onChange={e => setPriority(e.target.value)} type="number" style={inputStyle}/>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>上游 Base URL（留空则用 https://api.anthropic.com）</label>
        <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.anthropic.com" style={{ ...inputStyle, width: "100%" }}/>
      </div>
      {err && <div style={{ color: "var(--err)", fontSize: 12, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={busy} style={addBtn}>保存</button>
        <button type="button" onClick={onCancel} style={cancelBtn}>取消</button>
      </div>
    </form>
  );
}

const th = { padding: "10px 16px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", color: "var(--text-3)", fontWeight: 500 };
const td = { padding: "12px 16px", verticalAlign: "middle" };
const iconBtn = { display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 12, color: "var(--text-2)" };
const addBtn = { display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", padding: "8px 14px", background: "var(--clay)", color: "var(--on-clay)", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 };
const cancelBtn = { padding: "8px 14px", background: "transparent", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", fontSize: 13 };
const labelStyle = { display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 6 };
const inputStyle = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface)", color: "var(--text)", fontSize: 13, boxSizing: "border-box" };
