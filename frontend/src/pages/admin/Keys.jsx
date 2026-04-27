import { useState } from "react";
import { KeyRound, Ban, X } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync, fmtRelative } from "../../lib/hooks.js";
import { Loading, ErrorBox, Pill } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

export default function AdminKeys() {
  const [stateF, setStateF] = useState("");
  const [tick, setTick] = useState(0);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [toast, setToast] = useState(null);

  const qs = new URLSearchParams();
  if (stateF) qs.set("state", stateF);
  const { loading, data, error } = useAsync(() => api("/api/admin/keys?" + qs.toString()), [stateF, tick]);

  async function revoke(id, reason) {
    try {
      await api(`/api/admin/keys/${id}/revoke`, { method: "POST", body: { reason } });
      setRevokeTarget(null);
      setTick((t) => t + 1);
      setToast({ tone: "ok", text: "密钥已撤销" });
    } catch (e) { setToast({ tone: "err", text: e.message || "撤销失败" }); }
  }

  if (error) return <ErrorBox error={error}/>;
  const keys = data?.keys || [];

  return (
    <div>
      <PageHeader title="全部密钥" sub={loading ? "加载中…" : `跨租户视图 · ${keys.length} 个`}/>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <select value={stateF} onChange={(e) => setStateF(e.target.value)} style={filter}>
          <option value="">状态: 全部</option>
          <option value="active">活跃</option>
          <option value="revoked">已撤销</option>
        </select>
      </div>

      {toast && <Toast toast={toast} onDone={() => setToast(null)}/>}

      {loading ? <Loading/> : (
        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-3)" }}>
                <th style={th}>密钥</th>
                <th style={th}>归属账户</th>
                <th style={th}>创建</th>
                <th style={th}>最近使用</th>
                <th style={th}>状态</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 && <tr><td colSpan="6" style={{ padding: 32, textAlign: "center", color: "var(--text-3)" }}>没有密钥。</td></tr>}
              {keys.map((k) => (
                <tr key={k.id} style={{ borderTop: "1px solid var(--divider)" }}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <KeyRound size={14} color={k.state === "active" ? "var(--clay)" : "var(--text-4)"}/>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{k.name}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{k.prefix}…••••</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12 }}>{k.owner_email}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>{k.created_at?.slice(0, 10)}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>{fmtRelative(k.last_used_at)}</td>
                  <td style={td}>{k.state === "active" ? <Pill tone="ok" dot>活跃</Pill> : <Pill dot>已撤销</Pill>}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {k.state === "active" && (
                      <button onClick={() => setRevokeTarget(k)} style={iconBtn} title="撤销">
                        <Ban size={14} color="var(--err)"/>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {revokeTarget && <RevokeModal k={revokeTarget} onCancel={() => setRevokeTarget(null)} onConfirm={revoke}/>}
    </div>
  );
}

function RevokeModal({ k, onCancel, onConfirm }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 30 }}/>
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: 440, maxWidth: "calc(100vw - 32px)", zIndex: 31,
        background: "var(--surface-2)", borderRadius: 12, padding: 24,
        boxShadow: "var(--shadow-modal)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Ban size={16} color="var(--err)"/>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>撤销密钥</h3>
          <button onClick={onCancel} style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)" }}><X size={16}/></button>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, margin: "0 0 16px" }}>
          将撤销 <strong>{k.name}</strong>（<code style={{ fontFamily: "var(--font-mono)" }}>{k.prefix}…</code>），归属 {k.owner_email}。此操作会写入审计日志，且无法恢复。
        </p>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="撤销原因 (会写入审计日志)" style={{
          width: "100%", boxSizing: "border-box", padding: "8px 10px",
          border: "1px solid var(--border)", borderRadius: 6,
          background: "var(--surface-2)", color: "var(--text)", fontSize: 13, marginBottom: 16,
        }}/>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={ghost}>取消</button>
          <button onClick={async () => { setBusy(true); await onConfirm(k.id, reason); setBusy(false); }}
            style={{ ...cta, background: "var(--err)" }}>
            {busy ? "撤销中…" : "确认撤销"}
          </button>
        </div>
      </div>
    </>
  );
}

function Toast({ toast, onDone }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 40,
      background: toast.tone === "ok" ? "var(--ok-soft)" : "var(--err-soft)",
      color: toast.tone === "ok" ? "var(--ok-text)" : "var(--err-text)",
      padding: "10px 16px", borderRadius: 8, fontSize: 13,
      borderLeft: `2px solid ${toast.tone === "ok" ? "var(--ok)" : "var(--err)"}`,
      boxShadow: "var(--shadow-pop)", animation: "fadeIn 120ms var(--ease)",
    }} onAnimationEnd={() => setTimeout(onDone, 2400)}>{toast.text}</div>
  );
}

const card = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" };
const th = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", textAlign: "left", padding: "10px 16px", fontWeight: 400 };
const td = { padding: "12px 16px", color: "var(--text)" };
const filter = { padding: "8px 12px", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-2)", cursor: "pointer" };
const iconBtn = { background: "transparent", border: "none", padding: 6, borderRadius: 6, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };
const cta = { padding: "8px 14px", background: "var(--clay)", color: "var(--on-clay)", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer" };
const ghost = { padding: "8px 14px", background: "transparent", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 6, fontSize: 13, cursor: "pointer" };
