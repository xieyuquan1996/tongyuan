import { useEffect, useState } from "react";
import { KeyRound, Ban, X, Check, Copy } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync, fmtRelative } from "../../lib/hooks.js";
import { Loading, ErrorBox, Pill } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

export default function Keys() {
  const [tick, setTick] = useState(0);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [revokeId, setRevokeId] = useState(null);
  const [toast, setToast] = useState(null);
  const { loading, data, error } = useAsync(() => api("/api/console/keys"), [tick]);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  async function create() {
    if (!newName.trim()) {
      setToast({ tone: "err", text: "请先输入密钥名称" });
      return;
    }
    setBusy(true);
    try {
      const k = await api("/api/console/keys", { method: "POST", body: { name: newName.trim() } });
      setNewKey(k);
      setNewName("");
      setTick((t) => t + 1);
    } catch (err) {
      setToast({ tone: "err", text: err.message || "创建密钥失败" });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id) {
    try {
      await api(`/api/console/keys/${id}/revoke`, { method: "POST" });
      setRevokeId(null);
      setTick((t) => t + 1);
      setToast({ tone: "ok", text: "密钥已撤销" });
    } catch (err) {
      setToast({ tone: "err", text: err.message || "撤销失败" });
    }
  }

  if (error) return <ErrorBox error={error} />;
  const keys = data?.keys || [];
  const active = keys.filter((k) => k.state === "active").length;

  return (
    <div>
      <PageHeader title="API 密钥" sub={loading ? "加载中…" : `共 ${keys.length} 个 · ${active} 个活跃`} />

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 40,
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

      <div style={{
        background: "var(--surface-2)", border: "1px solid var(--border)",
        borderRadius: 12, padding: 16, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap",
      }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新密钥名称，如 production-api"
          style={{
            flex: 1, minWidth: 200, padding: "8px 12px",
            border: "1px solid var(--border)", borderRadius: 6,
            background: "var(--surface-2)", fontSize: 13,
          }}
        />
        <button onClick={create} disabled={busy} style={{
          ...ctaBtn,
          background: !newName.trim() || busy ? "var(--btn-disabled-bg)" : "var(--clay)",
          color: !newName.trim() || busy ? "var(--btn-disabled-fg)" : "var(--on-clay)",
          cursor: busy ? "wait" : "pointer",
        }}>
          + {busy ? "创建中…" : "创建密钥"}
        </button>
      </div>

      {loading ? <Loading /> : (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {keys.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>
              还没有密钥。用上面的输入框创建一个。
            </div>
          )}
          {keys.map((k, i) => (
            <div
              key={k.id}
              style={{
                display: "flex", alignItems: "center", gap: 24,
                padding: "20px 24px",
                borderTop: i ? "1px solid var(--divider)" : "none",
              }}
            >
              <KeyRound size={18} color={k.state === "active" ? "var(--clay)" : "var(--text-4)"} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{k.name}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>{k.prefix}…••••</div>
              </div>
              <div style={{ width: 120 }}>
                <div style={cellLabel}>创建于</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{k.created_at?.slice(0, 10)}</div>
              </div>
              <div style={{ width: 120 }}>
                <div style={cellLabel}>最近使用</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{fmtRelative(k.last_used_at)}</div>
              </div>
              {k.state === "active" ? <Pill tone="ok" dot>活跃</Pill> : <Pill dot>已撤销</Pill>}
              {k.state === "active" ? (
                <button onClick={() => setRevokeId(k.id)} style={{ ...iconBtn, color: "var(--err)" }} title="撤销">
                  <Ban size={16} />
                </button>
              ) : <span style={{ width: 28 }} />}
            </div>
          ))}
        </div>
      )}

      {newKey && <SecretModal keyObj={newKey} onClose={() => setNewKey(null)} />}
      {revokeId && <RevokeModal keyId={revokeId} keys={keys} onConfirm={revoke} onClose={() => setRevokeId(null)} />}
    </div>
  );
}

function SecretModal({ keyObj, onClose }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (copied) { const t = setTimeout(() => setCopied(false), 1500); return () => clearTimeout(t); } }, [copied]);
  async function copy() {
    try { await navigator.clipboard.writeText(keyObj.secret); setCopied(true); } catch (_) {}
  }
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 30 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: 520, maxWidth: "calc(100vw - 32px)", zIndex: 31,
        background: "var(--surface-2)", borderRadius: 12, padding: 28,
        boxShadow: "var(--shadow-modal)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <KeyRound size={18} color="var(--clay)" />
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>新密钥已创建</h3>
          <button onClick={onClose} style={{ ...iconBtn, marginLeft: "auto" }}><X size={18} /></button>
        </div>
        <div style={{
          background: "var(--warn-soft)", color: "var(--warn-text)", padding: "10px 14px",
          borderRadius: 6, fontSize: 13, marginBottom: 16, borderLeft: "2px solid var(--warn)",
        }}>
          密钥只在此处显示一次。立即复制保存，关闭窗口后将无法再看到。
        </div>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 13,
          background: "var(--surface-emphasis)", color: "var(--text-on-emphasis)",
          padding: 14, borderRadius: 8, wordBreak: "break-all", marginBottom: 12,
        }}>
          {keyObj.secret}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={copy}
            style={{ ...ctaBtn, background: copied ? "var(--ok)" : "var(--clay)" }}
          >
            {copied ? <><Check size={14} /> 已复制</> : <><Copy size={14} /> 复制密钥</>}
          </button>
          <button onClick={onClose} style={{ ...ctaBtn, background: "transparent", color: "var(--text)", border: "1px solid var(--border-strong)" }}>
            完成
          </button>
        </div>
      </div>
    </>
  );
}

function RevokeModal({ keyId, keys, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const key = keys.find((k) => k.id === keyId);
  async function confirm() {
    setBusy(true);
    try { await onConfirm(keyId); } finally { setBusy(false); }
  }
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 30 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: 440, maxWidth: "calc(100vw - 32px)", zIndex: 31,
        background: "var(--surface-2)", borderRadius: 12, padding: 28,
        boxShadow: "var(--shadow-modal)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Ban size={18} color="var(--err)" />
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>撤销密钥</h3>
          <button onClick={onClose} style={{ ...iconBtn, marginLeft: "auto" }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6, margin: "0 0 20px" }}>
          确定撤销 <strong>{key?.name}</strong>（<code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{key?.prefix}…</code>）？撤销后所有使用该密钥的请求将立即返回 401，无法恢复。
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ ...ctaBtn, background: "transparent", color: "var(--text)", border: "1px solid var(--border-strong)" }}>取消</button>
          <button onClick={confirm} disabled={busy} style={{ ...ctaBtn, background: "var(--err)" }}>
            {busy ? "撤销中…" : "确认撤销"}
          </button>
        </div>
      </div>
    </>
  );
}


const ctaBtn = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "10px 16px", background: "var(--clay)", color: "var(--on-clay)",
  border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
};
const iconBtn = {
  background: "transparent", border: "none", padding: 6, borderRadius: 6,
  cursor: "pointer", color: "var(--text-3)",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};
const cellLabel = {
  fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)",
  letterSpacing: "0.12em", textTransform: "uppercase",
};
