import { useState } from "react";
import { Users as UsersIcon, Search, Ban, CheckCircle2, Wallet, X, Check, Plus, Minus } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync, fmtRelative } from "../../lib/hooks.js";
import { Loading, ErrorBox, Pill } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

const PLANS = ["Starter", "Pro", "Enterprise"];

export default function AdminUsers() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);

  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (status) qs.set("status", status);
  if (plan) qs.set("plan", plan);
  const { loading, data, error } = useAsync(
    () => api("/api/admin/users?" + qs.toString()),
    [q, status, plan, tick]
  );

  if (error) return <ErrorBox error={error}/>;
  const users = data?.users || [];

  return (
    <div>
      <PageHeader title="用户" sub={loading ? "加载中…" : `共 ${users.length} 个账户`}/>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 240 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }}/>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索邮箱 / 名称…" style={{
            width: "100%", boxSizing: "border-box", padding: "8px 12px 8px 32px",
            border: "1px solid var(--border)", borderRadius: 6,
            background: "var(--surface-2)", fontSize: 13, color: "var(--text)",
          }}/>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={filter}>
          <option value="">状态: 全部</option>
          <option value="active">活跃</option>
          <option value="suspended">已冻结</option>
        </select>
        <select value={plan} onChange={(e) => setPlan(e.target.value)} style={filter}>
          <option value="">套餐: 全部</option>
          {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {toast && <Toast toast={toast} onDone={() => setToast(null)}/>}

      {loading ? <Loading/> : (
        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-3)" }}>
                <th style={th}>账户</th>
                <th style={th}>套餐</th>
                <th style={th}>余额</th>
                <th style={th}>本月消费</th>
                <th style={th}>上限</th>
                <th style={th}>注册</th>
                <th style={th}>状态</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan="7" style={{ padding: 32, textAlign: "center", color: "var(--text-3)" }}>没有匹配的用户。</td></tr>
              )}
              {users.map((u) => (
                <tr key={u.id} onClick={() => setSelected(u)} style={{ borderTop: "1px solid var(--divider)", cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={avatar}>{(u.name || u.email || "?")[0].toUpperCase()}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name || "—"}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{u.email}</div>
                      </div>
                      {u.role === "admin" && <Pill tone="clay">admin</Pill>}
                    </div>
                  </td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{u.plan}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>¥{u.balance}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>¥{u.spent_this_month}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>¥{u.limit_this_month}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>{fmtRelative(u.created_at)}</td>
                  <td style={td}>
                    {u.status === "suspended" ? <Pill tone="err" dot>已冻结</Pill> : <Pill tone="ok" dot>活跃</Pill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <UserDrawer
          userId={selected.id}
          onClose={() => setSelected(null)}
          onChanged={(msg) => { setToast({ tone: "ok", text: msg }); setTick((t) => t + 1); }}
          onError={(msg) => setToast({ tone: "err", text: msg })}
        />
      )}
    </div>
  );
}

function UserDrawer({ userId, onClose, onChanged, onError }) {
  const [tick, setTick] = useState(0);
  const { loading, data, error } = useAsync(() => api(`/api/admin/users/${userId}`), [userId, tick]);
  const [adjust, setAdjust] = useState({ delta: "", note: "" });
  const [editing, setEditing] = useState(null); // { plan, limit_this_month }

  async function patch(body, msg) {
    try {
      await api(`/api/admin/users/${userId}`, { method: "PATCH", body });
      setTick((t) => t + 1);
      onChanged(msg);
    } catch (e) { onError(e.message || "更新失败"); }
  }
  async function doAdjust() {
    const delta = parseFloat(adjust.delta || "0");
    if (!Number.isFinite(delta) || delta === 0) { onError("请输入非零金额"); return; }
    try {
      await api(`/api/admin/users/${userId}/adjust`, { method: "POST", body: { delta: adjust.delta, note: adjust.note } });
      setAdjust({ delta: "", note: "" });
      setTick((t) => t + 1);
      onChanged(`余额已${delta > 0 ? "增加" : "扣除"} ¥${Math.abs(delta).toFixed(2)}`);
    } catch (e) { onError(e.message || "调整失败"); }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 20 }}/>
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: 640, maxWidth: "100vw", zIndex: 21,
        background: "var(--surface-2)", borderLeft: "1px solid var(--border-strong)",
        display: "flex", flexDirection: "column",
        boxShadow: "var(--shadow-modal)",
      }}>
        {loading && <Loading/>}
        {error && <div style={{ padding: 24 }}><ErrorBox error={error}/></div>}
        {data && (
          <>
            <div style={{ padding: 24, borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                <UsersIcon size={16} color="var(--clay)"/>
                <span style={{ marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)" }}>用户详情</span>
                <button onClick={onClose} style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 6 }}><X size={18}/></button>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 4px" }}>{data.user.name || data.user.email}</h3>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
                {data.user.email} · 注册 {fmtRelative(data.user.created_at)} · <code>{data.user.id.slice(0, 8)}</code>
              </div>
            </div>

            <div style={{ padding: 24, overflow: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
              <Section title="账户状态">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  <Kv k="PLAN"    v={
                    <select defaultValue={data.user.plan} onChange={(e) => patch({ plan: e.target.value }, `套餐改为 ${e.target.value}`)} style={kvCtrl}>
                      {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  }/>
                  <Kv k="ROLE"    v={
                    <select defaultValue={data.user.role || "user"} onChange={(e) => patch({ role: e.target.value }, `角色改为 ${e.target.value}`)} style={kvCtrl}>
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  }/>
                  <Kv k="STATUS"  v={
                    data.user.status === "suspended" ? (
                      <button onClick={() => patch({ status: "active" }, "账户已解冻")} style={ghost}><CheckCircle2 size={12}/> 解冻</button>
                    ) : (
                      <button onClick={() => patch({ status: "suspended" }, "账户已冻结")} style={{ ...ghost, color: "var(--err)", borderColor: "var(--err)" }}><Ban size={12}/> 冻结</button>
                    )
                  }/>
                </div>
              </Section>

              <Section title="余额 / 消费">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
                  <Kv k="余额"    v={<span style={{ fontFamily: "var(--font-mono)", fontSize: 18 }}>¥{data.user.balance}</span>}/>
                  <Kv k="本月消费" v={<span style={{ fontFamily: "var(--font-mono)", fontSize: 18 }}>¥{data.user.spent_this_month}</span>}/>
                  <Kv k="月度上限" v={
                    <input defaultValue={data.user.limit_this_month}
                      onBlur={(e) => e.target.value !== data.user.limit_this_month && patch({ limit_this_month: e.target.value }, "月度上限已更新")}
                      style={kvCtrl}/>
                  }/>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Wallet size={14} color="var(--text-3)"/>
                  <input type="number" step="0.01" value={adjust.delta} onChange={(e) => setAdjust({ ...adjust, delta: e.target.value })}
                    placeholder="调整金额 (正数增加 / 负数扣减)" style={{ ...kvCtrl, flex: 1 }}/>
                  <input value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} placeholder="备注 (可选)" style={{ ...kvCtrl, flex: 1 }}/>
                  <button onClick={doAdjust} style={cta}>调整</button>
                </div>
              </Section>

              <Section title={`密钥 (${data.keys.length})`}>
                {data.keys.length === 0 ? <Empty text="用户还没有密钥"/> : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {data.keys.map((k) => (
                      <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, padding: "8px 10px", borderRadius: 6, background: "var(--surface-3)" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>{k.prefix}…</span>
                        <span style={{ flex: 1 }}>{k.name}</span>
                        {k.state === "active" ? <Pill tone="ok" dot>活跃</Pill> : <Pill dot>已撤销</Pill>}
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{fmtRelative(k.last_used_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section title={`最近请求 (${data.recent_logs.length})`}>
                {data.recent_logs.length === 0 ? <Empty text="还没有请求"/> : (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflow: "auto" }}>
                    {data.recent_logs.map((l) => (
                      <div key={l.id} style={{ display: "flex", gap: 12, color: l.status >= 400 ? "var(--err-text)" : "var(--text-2)" }}>
                        <span style={{ width: 40 }}>{l.status}</span>
                        <span style={{ flex: 1 }}>{l.model}</span>
                        <span style={{ color: "var(--text-3)" }}>{fmtRelative(l.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}
function Kv({ k, v }) {
  return (
    <div style={{ background: "var(--surface-3)", borderRadius: 6, padding: "8px 12px" }}>
      <div style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>{k}</div>
      <div style={{ fontSize: 13 }}>{v}</div>
    </div>
  );
}
function Empty({ text }) { return <div style={{ padding: 16, textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>{text}</div>; }

function Toast({ toast, onDone }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 40,
      background: toast.tone === "ok" ? "var(--ok-soft)" : "var(--err-soft)",
      color: toast.tone === "ok" ? "var(--ok-text)" : "var(--err-text)",
      padding: "10px 16px", borderRadius: 8,
      fontSize: 13, borderLeft: `2px solid ${toast.tone === "ok" ? "var(--ok)" : "var(--err)"}`,
      boxShadow: "var(--shadow-pop)",
      display: "flex", alignItems: "center", gap: 8,
      animation: "fadeIn 120ms var(--ease)",
    }} onAnimationEnd={() => setTimeout(onDone, 2400)}>
      {toast.tone === "ok" && <Check size={14}/>}{toast.text}
    </div>
  );
}

const card = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" };
const th = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", textAlign: "left", padding: "10px 16px", fontWeight: 400 };
const td = { padding: "12px 16px", color: "var(--text)" };
const filter = { padding: "8px 12px", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-2)", cursor: "pointer" };
const avatar = { width: 28, height: 28, borderRadius: "50%", background: "var(--surface-emphasis)", color: "var(--text-on-emphasis)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 12 };
const kvCtrl = { padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--surface-2)", color: "var(--text)", fontSize: 12, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
const cta = { padding: "6px 12px", background: "var(--clay)", color: "var(--on-clay)", border: "none", borderRadius: 4, fontSize: 12, cursor: "pointer", fontWeight: 500 };
const ghost = { display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 10px", background: "transparent", border: "1px solid var(--border-strong)", borderRadius: 4, fontSize: 12, cursor: "pointer", color: "var(--text)" };
