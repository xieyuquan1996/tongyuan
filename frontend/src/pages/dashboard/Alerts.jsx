import { useState, useEffect } from "react";
import { Bell, Plus, Trash2, X, Check } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/hooks.js";
import { Loading, ErrorBox } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

const KINDS = [
  { id: "balance_low",  label: "余额低于",    unit: "¥",   desc: "当账户余额低于阈值时通知" },
  { id: "spend_daily",  label: "单日消费超过", unit: "¥",  desc: "当当天消费超过阈值时通知" },
  { id: "error_rate",   label: "错误率高于",   unit: "%",  desc: "5 分钟内请求错误率超过阈值时通知" },
  { id: "latency_p99",  label: "p99 延迟超过", unit: "ms", desc: "任一区域 p99 延迟超过阈值时通知" },
];

const CHANNELS = [
  { id: "email",   label: "邮件" },
  { id: "browser", label: "浏览器推送" },
  { id: "webhook", label: "Webhook" },
];

export default function Alerts() {
  const [tick, setTick] = useState(0);
  const { loading, data, error } = useAsync(() => api("/api/console/alerts"), [tick]);
  const [adding, setAdding] = useState(false);
  const [newAlert, setNewAlert] = useState({ kind: "balance_low", threshold: 20, channel: "email" });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  async function add(e) {
    e.preventDefault();
    try {
      await api("/api/console/alerts", { method: "POST", body: newAlert });
      setAdding(false);
      setNewAlert({ kind: "balance_low", threshold: 20, channel: "email" });
      setTick((t) => t + 1);
      setToast({ tone: "ok", text: "告警已创建" });
    } catch (err) {
      setToast({ tone: "err", text: err.message || "创建失败" });
    }
  }
  async function toggle(a) {
    try {
      await api(`/api/console/alerts/${a.id}`, { method: "PATCH", body: { enabled: !a.enabled } });
      setTick((t) => t + 1);
      setToast({ tone: "ok", text: a.enabled ? "告警已禁用" : "告警已启用" });
    } catch (err) {
      setToast({ tone: "err", text: err.message || "操作失败" });
    }
  }
  async function patch(a, patch) {
    try {
      await api(`/api/console/alerts/${a.id}`, { method: "PATCH", body: patch });
      setTick((t) => t + 1);
      setToast({ tone: "ok", text: "告警已更新" });
    } catch (err) {
      setToast({ tone: "err", text: err.message || "更新失败" });
    }
  }
  async function remove(a) {
    try {
      await api(`/api/console/alerts/${a.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      setTick((t) => t + 1);
      setToast({ tone: "ok", text: "告警已删除" });
    } catch (err) {
      setToast({ tone: "err", text: err.message || "删除失败" });
    }
  }

  if (error) return <ErrorBox error={error}/>;
  const alerts = data?.alerts || [];

  return (
    <div>
      <PageHeader title="告警" sub="余额 / 消费 / 错误率 / 延迟"
        right={<button onClick={() => setAdding(true)} style={ctaBtn}><Plus size={14}/> 新增告警</button>}/>

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

      {adding && (
        <form onSubmit={add} style={{ ...card, padding: 20, marginBottom: 16 }}>
          <SectionLabel>新增告警</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10, marginTop: 10 }}>
            <select value={newAlert.kind} onChange={(e) => setNewAlert({ ...newAlert, kind: e.target.value })} style={ctrl}>
              {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
            <input type="number" step="0.1" value={newAlert.threshold}
              onChange={(e) => setNewAlert({ ...newAlert, threshold: e.target.value })}
              placeholder="阈值" style={ctrl}/>
            <select value={newAlert.channel} onChange={(e) => setNewAlert({ ...newAlert, channel: e.target.value })} style={ctrl}>
              {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={() => setAdding(false)} style={ghostBtn}>取消</button>
              <button type="submit" style={ctaBtn}>保存</button>
            </div>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>
            {KINDS.find((k) => k.id === newAlert.kind)?.desc}
          </div>
        </form>
      )}

      {loading ? <Loading/> : (
        <div style={card}>
          {alerts.length === 0 && (
            <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
              <Bell size={28} style={{ marginBottom: 12, opacity: 0.5 }}/>
              <div style={{ fontSize: 14 }}>还没有告警规则。点"新增告警"来创建。</div>
            </div>
          )}
          {alerts.map((a, i) => {
            const k = KINDS.find((x) => x.id === a.kind);
            return (
              <div key={a.id} style={{
                display: "grid", gridTemplateColumns: "20px 1fr 110px 120px 120px 32px",
                gap: 16, padding: "16px 20px", alignItems: "center",
                borderTop: i > 0 ? "1px solid var(--divider)" : "none",
              }}>
                <Bell size={16} color={a.enabled ? "var(--clay)" : "var(--text-4)"}/>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>
                    {k?.label} <span style={{ fontFamily: "var(--font-mono)", color: "var(--clay-press)" }}>{k?.unit}{a.threshold}</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{k?.desc}</div>
                </div>
                <input type="number" value={a.threshold} onChange={(e) => patch(a, { threshold: e.target.value })}
                  style={{ ...ctrl, padding: "6px 10px", fontSize: 13 }}/>
                <select value={a.channel} onChange={(e) => patch(a, { channel: e.target.value })}
                  style={{ ...ctrl, padding: "6px 10px", fontSize: 13 }}>
                  {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <button onClick={() => toggle(a)} style={{
                  padding: "6px 10px", borderRadius: 6, cursor: "pointer",
                  background: a.enabled ? "var(--ok-soft)" : "transparent",
                  color: a.enabled ? "var(--ok-text)" : "var(--text-3)",
                  border: a.enabled ? "none" : "1px solid var(--border)",
                  fontSize: 12, fontFamily: "var(--font-mono)",
                }}>
                  {a.enabled ? "已启用" : "已禁用"}
                </button>
                <button onClick={() => setDeleteTarget(a)} title="删除" style={iconBtn}>
                  <Trash2 size={14} color="var(--err)"/>
                </button>
              </div>
            );
          })}
        </div>
      )}
      {deleteTarget && (
        <>
          <div onClick={() => setDeleteTarget(null)} style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 30 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            width: 400, maxWidth: "calc(100vw - 32px)", zIndex: 31,
            background: "var(--surface-2)", borderRadius: 12, padding: 24,
            boxShadow: "var(--shadow-modal)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Trash2 size={16} color="var(--err)" />
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>删除告警</h3>
              <button onClick={() => setDeleteTarget(null)} style={{ ...iconBtn, marginLeft: "auto" }}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6, margin: "0 0 20px" }}>
              确定删除「{KINDS.find((k) => k.id === deleteTarget.kind)?.label} {deleteTarget.threshold}」告警？
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteTarget(null)} style={ghostBtn}>取消</button>
              <button onClick={() => remove(deleteTarget)} style={{ ...ctaBtn, background: "var(--err)" }}>确认删除</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const card = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" };
const SectionLabel = ({ children }) => <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)" }}>{children}</div>;
const ctrl = { padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-2)", color: "var(--text)", fontSize: 13 };
const ctaBtn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "var(--clay)", color: "var(--on-clay)", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer" };
const ghostBtn = { padding: "8px 14px", background: "transparent", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 6, fontSize: 13, cursor: "pointer" };
const iconBtn = { width: 28, height: 28, border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
