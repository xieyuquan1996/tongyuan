import { useState, useEffect } from "react";
import { Cpu, Plus, Trash2, Star, X, Check } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/hooks.js";
import { Loading, ErrorBox, Pill } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

export default function AdminModels() {
  const { loading, data, error, reload } = useAsync(() => api("/api/admin/models"), []);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ id: "", context: "200k", price: "$0 / $0", note: "" });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2500); return () => clearTimeout(t); } }, [toast]);

  async function create(e) {
    e.preventDefault();
    if (!draft.id.trim()) { setToast({ tone: "err", text: "请先填写模型 ID" }); return; }
    try {
      await api("/api/admin/models", { method: "POST", body: draft });
      setAdding(false);
      setDraft({ id: "", context: "200k", price: "$0 / $0", note: "" });
      reload();
      setToast({ tone: "ok", text: "模型已上架" });
    } catch (err) { setToast({ tone: "err", text: err.message || "创建失败" }); }
  }
  async function patch(m, body, msg) {
    try {
      await api(`/api/admin/models/${encodeURIComponent(m.id)}`, { method: "PATCH", body });
      reload();
      setToast({ tone: "ok", text: msg || "已更新" });
    } catch (err) { setToast({ tone: "err", text: err.message || "更新失败" }); }
  }
  async function remove(m) {
    try {
      await api(`/api/admin/models/${encodeURIComponent(m.id)}`, { method: "DELETE" });
      setDeleteTarget(null);
      reload();
      setToast({ tone: "ok", text: "模型已下架" });
    } catch (err) { setToast({ tone: "err", text: err.message || "删除失败" }); }
  }

  if (error) return <ErrorBox error={error}/>;
  const models = data?.models || [];

  return (
    <div>
      <PageHeader title="模型" sub={`${models.length} 个 · 对外可见`}
        right={<button onClick={() => setAdding(true)} style={ctaBtn}><Plus size={14}/> 上架模型</button>}/>

      {toast && <Toast toast={toast}/>}

      {adding && (
        <form onSubmit={create} style={{ ...card, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px" }}>上架新模型</h3>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr 2fr auto", gap: 8 }}>
            <input value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} placeholder="模型 ID · 如 claude-opus-4.7" style={ctrl}/>
            <input value={draft.context} onChange={(e) => setDraft({ ...draft, context: e.target.value })} placeholder="上下文" style={ctrl}/>
            <input value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="价格 · $input / $output" style={ctrl}/>
            <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="简介" style={ctrl}/>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={() => setAdding(false)} style={ghostBtn}>取消</button>
              <button type="submit" style={ctaBtn}>保存</button>
            </div>
          </div>
        </form>
      )}

      {loading ? <Loading/> : (
        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-3)" }}>
                <th style={th}>模型</th>
                <th style={th}>上下文</th>
                <th style={th}>价格 (input / output per Mtok)</th>
                <th style={th}>备注</th>
                <th style={th}>推荐</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {models.length === 0 && <tr><td colSpan="6" style={{ padding: 32, textAlign: "center", color: "var(--text-3)" }}>还没有模型。</td></tr>}
              {models.map((m) => (
                <tr key={m.id} style={{ borderTop: "1px solid var(--divider)" }}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Cpu size={14} color="var(--clay)"/>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{m.id}</span>
                      {m.recommended && <Pill tone="clay">推荐</Pill>}
                    </div>
                  </td>
                  <td style={td}><EditableCell value={m.context} onSave={(v) => patch(m, { context: v }, "上下文已更新")}/></td>
                  <td style={td}><EditableCell value={m.price}   onSave={(v) => patch(m, { price: v }, "价格已更新")}/></td>
                  <td style={td}><EditableCell value={m.note}    onSave={(v) => patch(m, { note: v }, "备注已更新")}/></td>
                  <td style={td}>
                    <button onClick={() => patch(m, { recommended: !m.recommended }, m.recommended ? "已取消推荐" : "已设为推荐")} style={{
                      padding: 6, background: "transparent", border: "none", cursor: "pointer",
                    }}>
                      <Star size={14} fill={m.recommended ? "var(--clay)" : "none"} color={m.recommended ? "var(--clay)" : "var(--text-4)"}/>
                    </button>
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <button onClick={() => setDeleteTarget(m)} style={iconBtn} title="下架">
                      <Trash2 size={14} color="var(--err)"/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <Modal title="下架模型" onClose={() => setDeleteTarget(null)}>
          <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
            下架 <code style={{ fontFamily: "var(--font-mono)" }}>{deleteTarget.id}</code> 后，新请求无法使用该模型，但不影响已有请求的计费。
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button onClick={() => setDeleteTarget(null)} style={ghostBtn}>取消</button>
            <button onClick={() => remove(deleteTarget)} style={{ ...ctaBtn, background: "var(--err)" }}>确认下架</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EditableCell({ value, onSave }) {
  const [v, setV] = useState(value || "");
  const [focused, setFocused] = useState(false);
  useEffect(() => setV(value || ""), [value]);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); if (v !== value) onSave(v); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
      style={{
        width: "100%", padding: "6px 8px",
        border: focused ? "1px solid var(--clay)" : "1px solid transparent",
        background: focused ? "var(--surface-2)" : "transparent",
        borderRadius: 4, fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text)",
      }}
    />
  );
}

function Modal({ title, onClose, children }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 30 }}/>
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: 440, maxWidth: "calc(100vw - 32px)", zIndex: 31,
        background: "var(--surface-2)", borderRadius: 12, padding: 24,
        boxShadow: "var(--shadow-modal)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)" }}><X size={16}/></button>
        </div>
        {children}
      </div>
    </>
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
      boxShadow: "var(--shadow-pop)",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      {toast.tone === "ok" && <Check size={14}/>}{toast.text}
    </div>
  );
}

const card = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 };
const th = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", textAlign: "left", padding: "10px 12px", fontWeight: 400 };
const td = { padding: "8px 12px", color: "var(--text)" };
const ctrl = { padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-2)", color: "var(--text)", fontSize: 13 };
const ctaBtn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "var(--clay)", color: "var(--on-clay)", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer" };
const ghostBtn = { padding: "8px 14px", background: "transparent", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 6, fontSize: 13, cursor: "pointer" };
const iconBtn = { background: "transparent", border: "none", padding: 6, borderRadius: 6, cursor: "pointer" };
