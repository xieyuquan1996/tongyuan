import { useState, useEffect, useRef } from "react";
import { Bell, Plus, Trash2, X, Check, Minus, ChevronDown, BellOff } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/hooks.js";
import { Loading, ErrorBox } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";
import { clearFiredState } from "../../lib/alert-poller.js";

const KINDS = [
  { id: "balance_low",  label: "余额低于",    unit: "¥",   desc: "当账户余额低于阈值时通知" },
  { id: "spend_daily",  label: "本月消费超过", unit: "¥",  desc: "当本月累计消费超过阈值时通知" },
  { id: "error_rate",   label: "错误率高于",   unit: "%",  desc: "30 天内请求错误率超过阈值时通知" },
  { id: "p99_latency",  label: "p99 延迟超过", unit: "ms", desc: "近期 p99 延迟超过阈值时通知" },
];

const CHANNELS = [
  // { id: "email",   label: "邮件" },    // TODO: 后端 evaluator + 邮件投递尚未实现
  { id: "browser", label: "浏览器推送" },
  // { id: "webhook", label: "Webhook" }, // TODO: 后端 evaluator + URL 字段尚未实现
];

export default function Alerts() {
  const [tick, setTick] = useState(0);
  const { loading, data, error } = useAsync(() => api("/api/console/alerts"), [tick]);
  const [adding, setAdding] = useState(false);
  const [newAlert, setNewAlert] = useState({ kind: "balance_low", threshold: 20, channel: "browser" });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [perm, setPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => { setOverrides({}); }, [data]);

  // Keep perm state in sync (e.g. if user changes it via browser UI).
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    const sync = () => setPerm(Notification.permission);
    const t = setInterval(sync, 2000);
    return () => clearInterval(t);
  }, []);

  async function requestPerm() {
    if (typeof Notification === "undefined") {
      setToast({ tone: "err", text: "当前浏览器不支持通知" });
      return;
    }
    const r = await Notification.requestPermission();
    setPerm(r);
    if (r === "granted") {
      // Reset the fired map so previously-triggered-but-silenced alerts
      // can actually fire now that we have permission.
      clearFiredState();
      setToast({ tone: "ok", text: "已允许浏览器通知" });
    } else {
      setToast({ tone: "err", text: "通知权限被拒绝，请在浏览器地址栏左侧的锁图标里放开" });
    }
  }

  function sendTestNotification() {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      setToast({ tone: "err", text: "请先允许通知权限" });
      return;
    }
    try {
      new Notification("同源 · 测试通知", { body: "如果看到这条，说明浏览器通知工作正常。" });
      setToast({ tone: "ok", text: "已发送测试通知" });
    } catch (e) {
      setToast({ tone: "err", text: "发送失败：" + (e.message || e) });
    }
  }

  async function add(e) {
    e.preventDefault();
    try {
      if (newAlert.channel === "browser" && typeof Notification !== "undefined") {
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
        if (Notification.permission !== "granted") {
          setToast({ tone: "err", text: "浏览器通知权限被拒绝，请在浏览器设置中允许" });
          return;
        }
      }
      await api("/api/console/alerts", { method: "POST", body: newAlert });
      setAdding(false);
      setNewAlert({ kind: "balance_low", threshold: 20, channel: "browser" });
      setTick((t) => t + 1);
      setToast({ tone: "ok", text: "告警已创建" });
    } catch (err) {
      setToast({ tone: "err", text: err.message || "创建失败" });
    }
  }
  async function toggle(a) {
    const next = !a.enabled;
    setOverrides((o) => ({ ...o, [a.id]: { ...o[a.id], enabled: next } }));
    try {
      await api(`/api/console/alerts/${a.id}`, { method: "PATCH", body: { enabled: next } });
      setToast({ tone: "ok", text: next ? "告警已启用" : "告警已禁用" });
    } catch (err) {
      setOverrides((o) => { const { [a.id]: _, ...rest } = o; return rest; });
      setToast({ tone: "err", text: err.message || "操作失败" });
      setTick((t) => t + 1);
    }
  }
  async function patch(a, body) {
    setOverrides((o) => ({ ...o, [a.id]: { ...o[a.id], ...body } }));
    try {
      await api(`/api/console/alerts/${a.id}`, { method: "PATCH", body });
      // Silent success — overrides stay until next refetch. No toast on
      // threshold/channel tweaks to reduce noise.
    } catch (err) {
      setOverrides((o) => { const { [a.id]: _, ...rest } = o; return rest; });
      setToast({ tone: "err", text: err.message || "更新失败" });
      setTick((t) => t + 1);
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
  const alerts = (data?.alerts || []).map((a) => ({ ...a, ...(overrides[a.id] || {}) }));

  return (
    <div>
      <PageHeader title="告警" sub="余额 / 消费 / 错误率 / 延迟"
        right={<button onClick={() => setAdding(true)} style={ctaBtn}><Plus size={14}/> 新增告警</button>}/>

      <PermBanner perm={perm} onRequest={requestPerm} onTest={sendTestNotification}/>

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
            <Select
              value={newAlert.kind}
              options={KINDS}
              onChange={(v) => setNewAlert({ ...newAlert, kind: v })}
            />
            <Stepper
              value={newAlert.threshold}
              unit={KINDS.find((k) => k.id === newAlert.kind)?.unit || ""}
              onCommit={(v) => setNewAlert({ ...newAlert, threshold: v })}
            />
            <Select
              value={newAlert.channel}
              options={CHANNELS}
              onChange={(v) => setNewAlert({ ...newAlert, channel: v })}
            />
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
                display: "grid", gridTemplateColumns: "20px 1fr 140px 140px 90px 32px",
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
                <Stepper
                  value={a.threshold}
                  unit={k?.unit || ""}
                  onCommit={(v) => patch(a, { threshold: v })}
                />
                <Select
                  value={a.channel}
                  options={CHANNELS}
                  onChange={(v) => patch(a, { channel: v })}
                />
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
const ctaBtn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "var(--clay)", color: "var(--on-clay)", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer" };
const ghostBtn = { padding: "8px 14px", background: "transparent", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 6, fontSize: 13, cursor: "pointer" };
const iconBtn = { width: 28, height: 28, border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };

// — Permission banner: tells the user if browser notifications are off,
// offers a request button, and a "send test" button when granted.
function PermBanner({ perm, onRequest, onTest }) {
  if (perm === "unsupported") {
    return (
      <div style={{ ...bannerBase, background: "var(--warn-soft)", borderLeftColor: "var(--warn)" }}>
        <BellOff size={14} color="var(--warn)"/>
        <span>当前浏览器不支持通知。告警功能将无法使用。</span>
      </div>
    );
  }
  if (perm === "default") {
    return (
      <div style={{ ...bannerBase, background: "var(--warn-soft)", borderLeftColor: "var(--warn)" }}>
        <Bell size={14} color="var(--warn)"/>
        <span>浏览器通知未授权。授权后余额/消费/错误率触发时会弹出桌面通知。</span>
        <button onClick={onRequest} style={{ ...ctaBtn, padding: "4px 10px", fontSize: 12, marginLeft: "auto" }}>请求权限</button>
      </div>
    );
  }
  if (perm === "denied") {
    return (
      <div style={{ ...bannerBase, background: "var(--err-soft)", borderLeftColor: "var(--err)" }}>
        <BellOff size={14} color="var(--err)"/>
        <span>浏览器通知已被拒绝。请在地址栏左侧的站点设置里放开"通知"权限再刷新。</span>
      </div>
    );
  }
  // granted
  return (
    <div style={{ ...bannerBase, background: "var(--ok-soft)", borderLeftColor: "var(--ok)" }}>
      <Bell size={14} color="var(--ok)"/>
      <span>浏览器通知已启用。触发规则时将弹出桌面提示。</span>
      <button onClick={onTest} style={{ ...ghostBtn, padding: "4px 10px", fontSize: 12, marginLeft: "auto" }}>发送测试</button>
    </div>
  );
}
const bannerBase = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "10px 14px", borderRadius: 8, marginBottom: 16,
  fontSize: 13, borderLeft: "2px solid", color: "var(--text)",
};

// — Stepper: a number input with custom − / + buttons, no native spinners,
// commits only on blur / Enter so typing doesn't spam the backend.
function Stepper({ value, unit, onCommit, step = 1 }) {
  const [local, setLocal] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setLocal(String(value)); }, [value, focused]);

  function commit(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) { setLocal(String(value)); return; }
    if (String(n) === String(value)) return;
    onCommit(String(n));
  }
  function bump(delta) {
    const n = (parseFloat(local) || 0) + delta;
    const next = String(Math.max(0, Math.round(n * 100) / 100));
    setLocal(next);
    onCommit(next);
  }

  return (
    <div style={{
      display: "flex", alignItems: "stretch", height: 32,
      border: "1px solid var(--border)", borderRadius: 6,
      background: "var(--surface-1)", overflow: "hidden",
    }}>
      <button type="button" onClick={() => bump(-step)} style={stepBtn} tabIndex={-1} aria-label="减">
        <Minus size={12}/>
      </button>
      <div style={{ display: "flex", alignItems: "center", paddingLeft: 8, color: "var(--text-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>{unit}</div>
      <input
        type="text" inputMode="decimal"
        value={local}
        onChange={(e) => setLocal(e.target.value.replace(/[^\d.]/g, ""))}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(local); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
        style={{
          flex: 1, minWidth: 0, padding: "0 4px",
          border: "none", background: "transparent", color: "var(--text)",
          fontSize: 13, fontFamily: "var(--font-mono)", textAlign: "center", outline: "none",
        }}
      />
      <button type="button" onClick={() => bump(step)} style={stepBtn} tabIndex={-1} aria-label="加">
        <Plus size={12}/>
      </button>
    </div>
  );
}

const stepBtn = {
  width: 28, display: "flex", alignItems: "center", justifyContent: "center",
  background: "transparent", color: "var(--text-2)", border: "none",
  cursor: "pointer", transition: "background 0.1s",
};

// — Select: custom popover-style dropdown, replaces native <select>.
// The popover uses fixed positioning so it escapes any parent overflow
// clipping (the alerts card uses overflow:hidden for rounded corners).
function Select({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const btnRef = useRef(null);
  const current = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    };
    update();
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  return (
    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button ref={btnRef} type="button" onClick={() => setOpen((o) => !o)} style={{
        width: "100%", height: 32, padding: "0 28px 0 12px",
        border: "1px solid var(--border)", borderRadius: 6,
        background: "var(--surface-1)", color: "var(--text)",
        fontSize: 13, textAlign: "left", cursor: "pointer",
        display: "flex", alignItems: "center", position: "relative",
        outline: open ? "2px solid var(--clay)" : "none", outlineOffset: -1,
      }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {current?.label ?? value}
        </span>
        <ChevronDown size={14} color="var(--text-3)" style={{
          position: "absolute", right: 10, top: "50%",
          transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)",
          transition: "transform 0.15s",
        }}/>
      </button>
      {open && rect && (
        <div style={{
          position: "fixed",
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
          background: "var(--surface-2)", border: "1px solid var(--border)",
          borderRadius: 6, boxShadow: "var(--shadow-pop)",
          padding: 4, zIndex: 100, maxHeight: 240, overflowY: "auto",
        }}>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => { onChange(o.id); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "8px 10px", borderRadius: 4, border: "none",
                background: o.id === value ? "var(--surface-3)" : "transparent",
                color: "var(--text)", fontSize: 13, textAlign: "left", cursor: "pointer",
              }}
              onMouseEnter={(e) => { if (o.id !== value) e.currentTarget.style.background = "var(--surface-3)"; }}
              onMouseLeave={(e) => { if (o.id !== value) e.currentTarget.style.background = "transparent"; }}
            >
              {o.id === value && <Check size={12} color="var(--clay)"/>}
              <span style={{ marginLeft: o.id === value ? 0 : 20 }}>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
