import { useState, useEffect } from "react";
import { Globe2, Server, Check } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/hooks.js";
import { Loading, ErrorBox, Pill } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

const STATUSES = [
  { id: "ok",   label: "正常", tone: "ok"   },
  { id: "warn", label: "降级", tone: "warn" },
  { id: "down", label: "故障", tone: "err"  },
];

export default function AdminRegions() {
  const [tick, setTick] = useState(0);
  const { loading, data, error } = useAsync(() => api("/api/admin/regions"), [tick]);
  const [toast, setToast] = useState(null);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2500); return () => clearTimeout(t); } }, [toast]);

  async function patchRegion(r, body) {
    try {
      await api(`/api/admin/regions/${r.id}`, { method: "PATCH", body });
      setTick((t) => t + 1);
      setToast({ tone: "ok", text: `${r.name} 已更新` });
    } catch (e) { setToast({ tone: "err", text: e.message || "更新失败" }); }
  }
  async function patchComponent(c, body) {
    try {
      await api(`/api/admin/components/${c.id}`, { method: "PATCH", body });
      setTick((t) => t + 1);
      setToast({ tone: "ok", text: `${c.name} 已更新` });
    } catch (e) { setToast({ tone: "err", text: e.message || "更新失败" }); }
  }

  if (error) return <ErrorBox error={error}/>;

  return (
    <div>
      <PageHeader title="区域 / 状态" sub="对外状态页的数据源"/>
      {toast && <Toast toast={toast}/>}

      {loading ? <Loading/> : (
        <>
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Server size={14} color="var(--clay)"/>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>核心组件</h3>
              <span style={mono11}>影响状态页聚合 `overall`</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 2fr", gap: 8 }}>
              {data.components.map((c) => (
                <RowGrid key={c.id}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                    <div style={mono11}>{c.id}</div>
                  </div>
                  <StatusPicker value={c.status} onChange={(v) => patchComponent(c, { status: v })}/>
                  <input defaultValue={c.note}
                    onBlur={(e) => e.target.value !== c.note && patchComponent(c, { note: e.target.value })}
                    placeholder="备注 · 会显示在状态页" style={ctrl}/>
                </RowGrid>
              ))}
            </div>
          </div>

          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Globe2 size={14} color="var(--clay)"/>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>区域</h3>
              <span style={mono11}>{data.regions.length} 个 · 实时延迟</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 140px", gap: 8 }}>
              {data.regions.map((r) => (
                <RowGrid key={r.id}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                    <div style={mono11}>{r.id}</div>
                  </div>
                  <StatusPicker value={r.status} onChange={(v) => patchRegion(r, { status: v })}/>
                  <input defaultValue={r.latency}
                    onBlur={(e) => e.target.value !== r.latency && patchRegion(r, { latency: e.target.value })}
                    placeholder="延迟 · 如 187ms" style={ctrl}/>
                </RowGrid>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RowGrid({ children }) {
  return <div style={{ display: "contents" }}>{children.map((c, i) => (
    <div key={i} style={{ display: "flex", alignItems: "center", padding: "10px 12px", borderTop: "1px solid var(--divider)" }}>{c}</div>
  ))}</div>;
}

function StatusPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {STATUSES.map((s) => {
        const active = s.id === value;
        return (
          <button key={s.id} onClick={() => onChange(s.id)} style={{
            padding: "4px 8px", borderRadius: 4,
            background: active ? (s.tone === "ok" ? "var(--ok-soft)" : s.tone === "warn" ? "var(--warn-soft)" : "var(--err-soft)") : "transparent",
            color: active ? (s.tone === "ok" ? "var(--ok-text)" : s.tone === "warn" ? "var(--warn-text)" : "var(--err-text)") : "var(--text-3)",
            border: active ? "none" : "1px solid var(--border)",
            cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 11,
          }}>{s.label}</button>
        );
      })}
    </div>
  );
}

function Toast({ toast }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 40,
      background: toast.tone === "ok" ? "var(--ok-soft)" : "var(--err-soft)",
      color: toast.tone === "ok" ? "var(--ok-text)" : "var(--err-text)",
      padding: "10px 16px", borderRadius: 8, fontSize: 13,
      borderLeft: `2px solid ${toast.tone === "ok" ? "var(--ok)" : "var(--err)"}`,
      boxShadow: "var(--shadow-pop)", display: "flex", gap: 8, alignItems: "center",
    }}>
      {toast.tone === "ok" && <Check size={14}/>}{toast.text}
    </div>
  );
}

const card = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 };
const mono11 = { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" };
const ctrl = { width: "100%", boxSizing: "border-box", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--surface-2)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font-mono)" };
