import { useEffect, useState } from "react";
import { KeyRound, Ban, X, Check, Copy, Sliders } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync, fmtRelative } from "../../lib/hooks.js";
import { Loading, ErrorBox, Pill } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

// Parse a UI string like "60" or "" → number | null. Empty/0 means "no
// limit" so the column is cleared. Anything else must be a positive int.
function parseLimit(s) {
  const t = String(s ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new Error("限额必须是正整数（留空表示不限）");
  }
  return n;
}

export default function Keys() {
  const [tick, setTick] = useState(0);
  const [newName, setNewName] = useState("");
  const [newRpm, setNewRpm] = useState("");
  const [newTpm, setNewTpm] = useState("");
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [revokeId, setRevokeId] = useState(null);
  const [editKey, setEditKey] = useState(null);
  const [toast, setToast] = useState(null);
  const { loading, data, error } = useAsync(() => api("/api/console/keys"), [tick]);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  async function create() {
    if (!newName.trim()) {
      setToast({ tone: "err", text: "请先输入密钥名称" });
      return;
    }
    let rpm, tpm;
    try { rpm = parseLimit(newRpm); tpm = parseLimit(newTpm); }
    catch (e) { setToast({ tone: "err", text: e.message }); return; }
    setBusy(true);
    try {
      const k = await api("/api/console/keys", {
        method: "POST",
        body: { name: newName.trim(), rpm_limit: rpm, tpm_limit: tpm },
      });
      setNewKey(k);
      setNewName(""); setNewRpm(""); setNewTpm("");
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

  async function saveEdit(id, patch) {
    try {
      await api(`/api/console/keys/${id}`, { method: "PATCH", body: patch });
      setEditKey(null);
      setTick((t) => t + 1);
      setToast({ tone: "ok", text: "已保存" });
    } catch (err) {
      setToast({ tone: "err", text: err.message || "保存失败" });
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
        <input
          value={newRpm}
          onChange={(e) => setNewRpm(e.target.value)}
          placeholder="RPM 限额（可选）"
          inputMode="numeric"
          style={{
            width: 140, padding: "8px 12px",
            border: "1px solid var(--border)", borderRadius: 6,
            background: "var(--surface-2)", fontSize: 13,
          }}
        />
        <input
          value={newTpm}
          onChange={(e) => setNewTpm(e.target.value)}
          placeholder="TPM 限额（可选）"
          inputMode="numeric"
          style={{
            width: 160, padding: "8px 12px",
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
              <div style={{ width: 110 }}>
                <div style={cellLabel}>限额</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-2)" }}>
                  {k.rpm_limit ? `${k.rpm_limit}/m` : "—"}
                  {k.tpm_limit ? ` · ${formatTpm(k.tpm_limit)}t/m` : ""}
                </div>
              </div>
              {k.state === "active" ? <Pill tone="ok" dot>活跃</Pill> : <Pill dot>已撤销</Pill>}
              {k.state === "active" ? (
                <>
                  <button onClick={() => setEditKey(k)} style={{ ...iconBtn }} title="编辑限额">
                    <Sliders size={16} />
                  </button>
                  <button onClick={() => setRevokeId(k.id)} style={{ ...iconBtn, color: "var(--err)" }} title="撤销">
                    <Ban size={16} />
                  </button>
                </>
              ) : <span style={{ width: 56 }} />}
            </div>
          ))}
        </div>
      )}

      {newKey && <SecretModal keyObj={newKey} onClose={() => setNewKey(null)} />}
      {revokeId && <RevokeModal keyId={revokeId} keys={keys} onConfirm={revoke} onClose={() => setRevokeId(null)} />}
      {editKey && <EditModal keyObj={editKey} onSave={saveEdit} onClose={() => setEditKey(null)} />}
    </div>
  );
}

// Pretty-print TPM with k/M suffix so 60000/min reads as "60k" instead of
// blowing out the column width.
function formatTpm(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1) + "k";
  return String(v);
}

function EditModal({ keyObj, onSave, onClose }) {
  const [name, setName] = useState(keyObj.name);
  const [rpm, setRpm] = useState(keyObj.rpm_limit != null ? String(keyObj.rpm_limit) : "");
  const [tpm, setTpm] = useState(keyObj.tpm_limit != null ? String(keyObj.tpm_limit) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    let rpmN, tpmN;
    try { rpmN = parseLimit(rpm); tpmN = parseLimit(tpm); }
    catch (e) { setErr(e.message); return; }
    setBusy(true);
    try {
      await onSave(keyObj.id, { name: name.trim() || keyObj.name, rpm_limit: rpmN, tpm_limit: tpmN });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 30 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: 480, maxWidth: "calc(100vw - 32px)", zIndex: 31,
        background: "var(--surface-2)", borderRadius: 12, padding: 28,
        boxShadow: "var(--shadow-modal)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Sliders size={18} color="var(--clay)" />
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>编辑密钥</h3>
          <button onClick={onClose} style={{ ...iconBtn, marginLeft: "auto" }}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={fieldLbl}>
            名称
            <input value={name} onChange={(e) => setName(e.target.value)} style={fieldInput} />
          </label>
          <label style={fieldLbl}>
            RPM 限额（每分钟请求数，留空表示不限）
            <input value={rpm} onChange={(e) => setRpm(e.target.value)} inputMode="numeric" placeholder="例如 60" style={fieldInput} />
          </label>
          <label style={fieldLbl}>
            TPM 限额（每分钟 token 数，留空表示不限）
            <input value={tpm} onChange={(e) => setTpm(e.target.value)} inputMode="numeric" placeholder="例如 100000" style={fieldInput} />
          </label>
          {err && <div style={{
            background: "var(--err-soft)", color: "var(--err-text)", padding: "8px 12px",
            borderRadius: 6, fontSize: 13, borderLeft: "2px solid var(--err)",
          }}>{err}</div>}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={{ ...ctaBtn, background: "transparent", color: "var(--text)", border: "1px solid var(--border-strong)" }}>取消</button>
          <button onClick={submit} disabled={busy} style={{ ...ctaBtn, background: busy ? "var(--btn-disabled-bg)" : "var(--clay)" }}>
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </>
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
const fieldLbl = {
  display: "flex", flexDirection: "column", gap: 6,
  fontSize: 12, color: "var(--text-2)",
};
const fieldInput = {
  padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6,
  background: "var(--surface-2)", fontSize: 13, color: "var(--text)",
};
