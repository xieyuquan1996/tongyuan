import { useState, useEffect } from "react";
import { KeyRound, Plus, Trash2, RefreshCw, Gauge, Save } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/hooks.js";
import { Loading, ErrorBox } from "../../components/primitives.jsx";

const STATE_COLORS = {
  active:   { bg: "var(--ok-soft)",   text: "var(--ok-text)",   label: "活跃" },
  cooldown: { bg: "var(--warn-soft)", text: "var(--warn-text)", label: "冷却中" },
  disabled: { bg: "var(--surface-3)", text: "var(--text-3)",    label: "已禁用" },
};

const FAMILIES = ["opus", "sonnet", "haiku"];

export default function UpstreamKeys() {
  const { loading, data, error, reload } = useAsync(() => api("/api/admin/upstream-keys"), []);
  const [adding, setAdding] = useState(false);
  const [showQuota, setShowQuota] = useState(false);
  const [quotaData, setQuotaData] = useState(null);
  const [editingKey, setEditingKey] = useState(null); // upstream id | 'defaults'

  // Poll /quota every 3s while the panel is open — per-minute buckets move
  // fast and stale numbers are worse than no numbers for ops debugging.
  useEffect(() => {
    if (!showQuota) return;
    let alive = true;
    const tick = async () => {
      try { const d = await api("/api/admin/upstream-keys/quota"); if (alive) setQuotaData(d); } catch {}
    };
    tick();
    const iv = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(iv); };
  }, [showQuota]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  const keys = data.upstream_keys || [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 24, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>上游密钥</h1>
          <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
            Anthropic API Key 池 · {keys.length} 个 · 按优先级顺序尝试，按家族（Opus / Sonnet / Haiku）预留 RPM/TPM 预算
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button onClick={() => setShowQuota((v) => !v)} style={secondaryBtn}>
            <Gauge size={14}/> {showQuota ? "隐藏限流" : "查看限流"}
          </button>
          <button onClick={() => setEditingKey("defaults")} style={secondaryBtn}>
            全局默认
          </button>
          <button onClick={() => setAdding(true)} style={addBtn}>
            <Plus size={14}/> 添加密钥
          </button>
        </div>
      </div>

      {adding && <AddKeyForm onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />}
      {editingKey && <QuotaEditor target={editingKey} onDone={() => setEditingKey(null)} />}

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
                <KeyRow key={k.id} row={k} last={i === keys.length - 1} onRefresh={reload} onEditQuota={() => setEditingKey(k.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showQuota && <QuotaPanel data={quotaData} />}
    </div>
  );
}

function QuotaPanel({ data }) {
  if (!data) return <div style={{ marginTop: 16, color: "var(--text-3)", fontSize: 13 }}>加载中…</div>;
  const rows = data.upstream_keys || [];
  return (
    <div style={{ marginTop: 20, border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>本分钟用量 · 按上游 × 家族</div>
      <div style={{ display: "grid", gap: 14 }}>
        {rows.map((row) => (
          <div key={row.id} style={{ display: "grid", gridTemplateColumns: "180px 1fr 1fr 1fr", gap: 12, alignItems: "center" }}>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{row.alias}</div>
            {FAMILIES.map((fam) => {
              const f = row.families[fam];
              return <FamilyCell key={fam} label={fam} f={f} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function FamilyCell({ label, f }) {
  const cooling = f.cooldown_until && f.cooldown_until > Date.now();
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: cooling ? "var(--warn-soft)" : "var(--surface-2)" }}>
      <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}{cooling ? " · 冷却中" : ""}</div>
      <Bar label="RPM" used={f.rpm.used} limit={f.rpm.limit} />
      <Bar label="ITPM" used={f.itpm.used} limit={f.itpm.limit} />
      <Bar label="OTPM" used={f.otpm.used} limit={f.otpm.limit} />
    </div>
  );
}

function Bar({ label, used, limit }) {
  const pct = Math.min(100, (used / limit) * 100);
  const color = pct > 85 ? "var(--err)" : pct > 60 ? "var(--warn)" : "var(--clay)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginTop: 4 }}>
      <span style={{ width: 44, color: "var(--text-3)" }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: "var(--surface-3)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
      <span style={{ width: 90, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{used.toLocaleString()}/{limit.toLocaleString()}</span>
    </div>
  );
}

function QuotaEditor({ target, onDone }) {
  const isDefaults = target === "defaults";
  const endpoint = isDefaults ? "/api/admin/upstream-keys/quota-defaults" : `/api/admin/upstream-keys/${target}/quota-override`;
  const putKey = isDefaults ? null : target;
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api(endpoint).then((d) => {
      if (!alive) return;
      const src = isDefaults ? d.defaults : (d.override ?? {});
      const fallback = { rpm: 50, itpmExclCache: 30000, otpm: 8000 };
      setForm({
        opus: src.opus ?? (isDefaults ? fallback : null),
        sonnet: src.sonnet ?? (isDefaults ? fallback : null),
        haiku: src.haiku ?? (isDefaults ? { rpm: 50, itpmExclCache: 50000, otpm: 10000 } : null),
      });
    }).catch((e) => setErr(e.message));
    return () => { alive = false; };
  }, [endpoint, isDefaults]);

  if (!form) return <div style={editorBox}>加载中…</div>;

  function setField(fam, key, v) {
    setForm((p) => ({ ...p, [fam]: { ...(p[fam] ?? { rpm: 0, itpmExclCache: 0, otpm: 0 }), [key]: Number(v) } }));
  }

  function clearFamily(fam) {
    setForm((p) => ({ ...p, [fam]: null }));
  }

  async function save() {
    setBusy(true); setErr("");
    try {
      const body = {};
      for (const fam of FAMILIES) {
        if (form[fam]) body[fam] = form[fam];
      }
      await api(endpoint, { method: "PUT", body: isDefaults ? body : body });
      onDone();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div style={editorBox}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {isDefaults ? "全局默认限额" : `Key 限额覆盖 · ${putKey.slice(0, 8)}…`}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 14 }}>
        {isDefaults
          ? "所有没有自定义覆盖的 Key 使用这套限额。默认匹配 Anthropic Active 梯度。"
          : "留空的家族将继承全局默认。点击「清除该家族」以移除覆盖。"}
      </div>
      {FAMILIES.map((fam) => (
        <div key={fam} style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr 1fr auto", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <div style={{ textTransform: "capitalize", fontWeight: 500 }}>{fam}</div>
          {form[fam] ? (
            <>
              <LabeledInput label="RPM" value={form[fam].rpm} onChange={(v) => setField(fam, "rpm", v)} />
              <LabeledInput label="ITPM (排除缓存读)" value={form[fam].itpmExclCache} onChange={(v) => setField(fam, "itpmExclCache", v)} />
              <LabeledInput label="OTPM" value={form[fam].otpm} onChange={(v) => setField(fam, "otpm", v)} />
              {!isDefaults && <button type="button" onClick={() => clearFamily(fam)} style={linkBtn}>清除该家族</button>}
              {isDefaults && <span/>}
            </>
          ) : (
            <>
              <div style={{ gridColumn: "span 3", color: "var(--text-3)", fontSize: 12 }}>继承全局默认</div>
              <button type="button" onClick={() => setField(fam, "rpm", 50)} style={linkBtn}>添加覆盖</button>
            </>
          )}
        </div>
      ))}
      {err && <div style={{ color: "var(--err)", fontSize: 12, marginTop: 6 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={busy} style={addBtn}>
          <Save size={13}/> 保存
        </button>
        <button onClick={onDone} style={cancelBtn}>取消</button>
      </div>
    </div>
  );
}

function LabeledInput({ label, value, onChange }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} type="number" min="1" style={inputStyle}/>
    </div>
  );
}

function KeyRow({ row, last, onRefresh, onEditQuota }) {
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
        <button onClick={onEditQuota} disabled={busy} title="编辑限额" style={iconBtn}>
          <Gauge size={13}/> 限额
        </button>
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
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);

  function validate() {
    const e = {};
    if (!alias.trim()) e.alias = "必填";
    if (!secret.trim()) e.secret = "必填";
    else if (secret.trim().length < 10) e.secret = "密钥太短（至少 10 位）";
    if (baseUrl.trim() && !/^https?:\/\/.+/.test(baseUrl.trim())) e.baseUrl = "请输入有效的 URL";
    return e;
  }

  async function submit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErr(errs); return; }
    setBusy(true);
    try {
      await api("/api/admin/upstream-keys", {
        method: "POST",
        body: { alias: alias.trim(), secret: secret.trim(), priority: parseInt(priority) || 0, ...(baseUrl.trim() ? { base_url: baseUrl.trim() } : {}) },
      });
      onDone();
    } catch (ex) {
      setErr({ form: ex.message || "添加失败" });
      setBusy(false);
    }
  }

  const field = (key, label, input) => (
    <div>
      <label style={labelStyle}>{label}</label>
      {input}
      {err[key] && <div style={{ color: "var(--err)", fontSize: 11, marginTop: 3 }}>{err[key]}</div>}
    </div>
  );

  return (
    <form onSubmit={submit} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, background: "var(--surface-2)" }}>
      <div style={{ fontWeight: 600, marginBottom: 16 }}>添加上游密钥</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 80px", gap: 12, marginBottom: 12 }}>
        {field("alias", "别名", <input value={alias} onChange={e => { setAlias(e.target.value); setErr(p => ({...p, alias: ""})); }} placeholder="如 key-1" style={inputStyle}/>)}
        {field("secret", "Anthropic API Key", <input value={secret} onChange={e => { setSecret(e.target.value); setErr(p => ({...p, secret: ""})); }} placeholder="sk-ant-..." type="password" style={inputStyle}/>)}
        {field("priority", "优先级", <input value={priority} onChange={e => setPriority(e.target.value)} type="number" style={inputStyle}/>)}
      </div>
      {field("baseUrl", "上游 Base URL（留空则用 https://api.anthropic.com）", <input value={baseUrl} onChange={e => { setBaseUrl(e.target.value); setErr(p => ({...p, baseUrl: ""})); }} placeholder="https://api.anthropic.com" style={{ ...inputStyle, width: "100%" }}/>)}
      {err.form && <div style={{ color: "var(--err)", fontSize: 12, marginTop: 8 }}>{err.form}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button type="submit" disabled={busy} style={addBtn}>保存</button>
        <button type="button" onClick={onCancel} style={cancelBtn}>取消</button>
      </div>
    </form>
  );
}

const th = { padding: "10px 16px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", color: "var(--text-3)", fontWeight: 500 };
const td = { padding: "12px 16px", verticalAlign: "middle" };
const iconBtn = { display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 12, color: "var(--text-2)" };
const addBtn = { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "var(--clay)", color: "var(--on-clay)", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 };
const secondaryBtn = { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", fontSize: 13 };
const cancelBtn = { padding: "8px 14px", background: "transparent", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", fontSize: 13 };
const labelStyle = { display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 6 };
const inputStyle = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-2)", color: "var(--text)", fontSize: 13, boxSizing: "border-box" };
const editorBox = { border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20, background: "var(--surface-2)" };
const linkBtn = { background: "transparent", border: "none", color: "var(--clay)", cursor: "pointer", fontSize: 12, padding: 0 };
