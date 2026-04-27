import { useState, useEffect } from "react";
import { Megaphone, Pin, Eye, EyeOff, Trash2, Plus, Check, X } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync, fmtRelative } from "../../lib/hooks.js";
import { Loading, ErrorBox, Pill } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

const SEVERITIES = [
  { id: "info", label: "通知", tone: "default" },
  { id: "warn", label: "警告", tone: "warn" },
  { id: "err",  label: "事故", tone: "err"  },
];

export default function AdminAnnouncements() {
  const [tick, setTick] = useState(0);
  const { loading, data, error } = useAsync(() => api("/api/admin/announcements"), [tick]);
  const [editing, setEditing] = useState(null); // { id?, title, body, severity, pinned, visible }
  const [toast, setToast] = useState(null);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2500); return () => clearTimeout(t); } }, [toast]);

  function startNew() { setEditing({ title: "", body: "", severity: "info", pinned: false, visible: true }); }
  function startEdit(a) { setEditing({ ...a }); }

  async function save() {
    try {
      if (editing.id) {
        await api(`/api/admin/announcements/${editing.id}`, { method: "PATCH", body: editing });
      } else {
        await api("/api/admin/announcements", { method: "POST", body: editing });
      }
      setEditing(null);
      setTick((t) => t + 1);
      setToast({ tone: "ok", text: "公告已保存" });
    } catch (e) { setToast({ tone: "err", text: e.message || "保存失败" }); }
  }
  async function patch(a, body, msg) {
    try {
      await api(`/api/admin/announcements/${a.id}`, { method: "PATCH", body });
      setTick((t) => t + 1);
      setToast({ tone: "ok", text: msg });
    } catch (e) { setToast({ tone: "err", text: e.message || "更新失败" }); }
  }
  async function remove(a) {
    try {
      await api(`/api/admin/announcements/${a.id}`, { method: "DELETE" });
      setTick((t) => t + 1);
      setToast({ tone: "ok", text: "公告已删除" });
    } catch (e) { setToast({ tone: "err", text: e.message || "删除失败" }); }
  }

  if (error) return <ErrorBox error={error}/>;
  const list = data?.announcements || [];

  return (
    <div>
      <PageHeader title="公告" sub="显示在控制台顶部和登录页"
        right={<button onClick={startNew} style={ctaBtn}><Plus size={14}/> 新增公告</button>}/>

      {toast && <Toast toast={toast}/>}

      {loading ? <Loading/> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.length === 0 && (
            <div style={{ ...card, padding: 48, textAlign: "center", color: "var(--text-3)" }}>
              <Megaphone size={28} style={{ marginBottom: 12, opacity: 0.5 }}/>
              <div style={{ fontSize: 14 }}>还没有公告。</div>
            </div>
          )}
          {list.map((a) => {
            const sev = SEVERITIES.find((s) => s.id === a.severity) || SEVERITIES[0];
            return (
              <div key={a.id} style={{
                ...card, padding: 16,
                opacity: a.visible ? 1 : 0.55,
                borderLeft: `3px solid var(--${a.severity === "info" ? "clay" : a.severity === "warn" ? "warn" : "err"})`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Pill tone={sev.tone} dot>{sev.label}</Pill>
                  {a.pinned && <Pill tone="clay" dot>置顶</Pill>}
                  {!a.visible && <Pill dot>未发布</Pill>}
                  <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                    <button onClick={() => patch(a, { pinned: !a.pinned }, a.pinned ? "已取消置顶" : "已置顶")}
                      style={miniBtn} title={a.pinned ? "取消置顶" : "置顶"}>
                      <Pin size={13} color={a.pinned ? "var(--clay)" : "var(--text-3)"}/>
                    </button>
                    <button onClick={() => patch(a, { visible: !a.visible }, a.visible ? "已下线" : "已发布")}
                      style={miniBtn} title={a.visible ? "下线" : "发布"}>
                      {a.visible ? <Eye size={13} color="var(--ok)"/> : <EyeOff size={13} color="var(--text-3)"/>}
                    </button>
                    <button onClick={() => startEdit(a)} style={{ ...miniBtn, padding: "3px 10px", fontSize: 12, fontFamily: "var(--font-mono)" }}>编辑</button>
                    <button onClick={() => remove(a)} style={miniBtn} title="删除">
                      <Trash2 size={13} color="var(--err)"/>
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{a.title}</div>
                <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, marginBottom: 8 }}>{a.body}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{fmtRelative(a.created_at)} · {a.id}</div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <>
          <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 30 }}/>
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            width: 560, maxWidth: "calc(100vw - 32px)", zIndex: 31,
            background: "var(--surface-2)", borderRadius: 12, padding: 24,
            boxShadow: "var(--shadow-modal)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Megaphone size={16} color="var(--clay)"/>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{editing.id ? "编辑公告" : "新增公告"}</h3>
              <button onClick={() => setEditing(null)} style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)" }}><X size={16}/></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Field label="标题">
                <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} style={ctrl}/>
              </Field>
              <Field label="正文">
                <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={4} style={{ ...ctrl, resize: "vertical", fontFamily: "inherit" }}/>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <Field label="严重性">
                  <select value={editing.severity} onChange={(e) => setEditing({ ...editing, severity: e.target.value })} style={ctrl}>
                    {SEVERITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label="置顶">
                  <select value={editing.pinned ? "1" : "0"} onChange={(e) => setEditing({ ...editing, pinned: e.target.value === "1" })} style={ctrl}>
                    <option value="0">否</option><option value="1">是</option>
                  </select>
                </Field>
                <Field label="立即发布">
                  <select value={editing.visible ? "1" : "0"} onChange={(e) => setEditing({ ...editing, visible: e.target.value === "1" })} style={ctrl}>
                    <option value="1">发布</option><option value="0">草稿</option>
                  </select>
                </Field>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setEditing(null)} style={ghostBtn}>取消</button>
              <button onClick={save} style={ctaBtn}>保存</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 6 }}>{label}</div>
      {children}
    </label>
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

const card = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12 };
const ctrl = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-2)", color: "var(--text)", fontSize: 13 };
const ctaBtn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "var(--clay)", color: "var(--on-clay)", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer" };
const ghostBtn = { padding: "8px 14px", background: "transparent", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 6, fontSize: 13, cursor: "pointer" };
const miniBtn = { background: "transparent", border: "none", padding: 6, borderRadius: 4, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };
