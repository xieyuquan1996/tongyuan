import { useState } from "react";
import { CreditCard, Check, Loader2 } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync, fmtRelative } from "../../lib/hooks.js";
import { Loading, ErrorBox, Pill } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

const PRESETS = [50, 100, 200, 500, 1000, 2000];
const METHODS = [
  { id: "alipay", name: "支付宝", hint: "推荐 · 到账 < 1 分钟" },
  { id: "wechat", name: "微信支付", hint: "到账 < 1 分钟" },
  { id: "bank",   name: "企业对公", hint: "1-3 工作日" },
];

export default function Recharge() {
  const [amount, setAmount] = useState("200");
  const [method, setMethod] = useState("alipay");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const amountNum = Number(amount);
  const valid = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= 100000;

  const billing = useAsync(() => api("/api/console/billing"), [reloadKey]);
  const history = useAsync(() => api("/api/console/recharges"), [reloadKey]);

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      const r = await api("/api/console/recharge", {
        method: "POST",
        body: { amount: String(amountNum), method },
      });
      setToast({ tone: "ok", text: `充值成功，到账 ¥${r.recharge.amount}。余额 ¥${r.balance}。` });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setToast({ tone: "err", text: err.message || "充值失败" });
    } finally {
      setBusy(false);
    }
  }

  if (billing.error) return <ErrorBox error={billing.error}/>;

  return (
    <div>
      <PageHeader title="充值" sub="按量付费 · 无到期时间"/>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginBottom: 24 }}>
        <div style={card}>
          {billing.loading ? <Loading/> : (
            <>
              <div style={mono10}>当前余额</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 6 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 48, fontWeight: 600, letterSpacing: "-0.02em" }}>
                  {billing.data.billing.balance || "¥0.00"}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
                  本月已用 {billing.data.billing.used} / 上限 {billing.data.billing.limit}
                </span>
              </div>
            </>
          )}
        </div>
        {/* 暂时隐藏 - 套餐卡片
        <div style={card}>
          <div style={mono10}>当前套餐</div>
          <div style={{ fontSize: 20, fontWeight: 600, marginTop: 6 }}>{billing.data?.plan || "—"}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
            下次结算 {billing.data?.billing?.next_reset}
          </div>
        </div>
        */}
      </div>

      {toast && (
        <div style={{
          background: toast.tone === "ok" ? "var(--ok-soft)" : "var(--err-soft)",
          color: toast.tone === "ok" ? "var(--ok-text)" : "var(--err-text)",
          padding: "12px 16px", borderRadius: 8, marginBottom: 16,
          fontSize: 13, borderLeft: `2px solid ${toast.tone === "ok" ? "var(--ok)" : "var(--err)"}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          {toast.tone === "ok" && <Check size={14}/>}
          {toast.text}
        </div>
      )}

      <form onSubmit={submit} style={card}>
        <SectionLabel>充值金额</SectionLabel>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => setAmount(String(p))} style={{
              padding: "10px 16px", borderRadius: 8,
              background: amountNum === p ? "var(--clay)" : "transparent",
              color: amountNum === p ? "var(--on-clay)" : "var(--text)",
              border: amountNum === p ? "none" : "1px solid var(--border)",
              cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500,
            }}>¥{p}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>自定义</span>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", fontSize: 14 }}>¥</span>
            <input type="number" min={1} max={100000} step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ padding: "10px 12px 10px 28px", border: "1px solid var(--border)", borderRadius: 6, width: 160, fontSize: 14, background: "var(--surface-2)", color: "var(--text)" }}/>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>单笔最高 ¥100,000</span>
        </div>

        <SectionLabel>付款方式</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 24 }}>
          {METHODS.map((m) => (
            <button key={m.id} type="button" onClick={() => setMethod(m.id)} style={{
              textAlign: "left",
              padding: 14, borderRadius: 8,
              border: method === m.id ? "1px solid var(--clay)" : "1px solid var(--border)",
              background: method === m.id ? "var(--clay-soft)" : "transparent",
              cursor: "pointer",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <CreditCard size={14} color="var(--clay)"/>
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{m.name}</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{m.hint}</div>
            </button>
          ))}
        </div>

        <button type="submit" disabled={busy || !valid} style={{
          padding: "12px 20px",
          background: busy || !valid ? "var(--btn-disabled-bg)" : "var(--clay)",
          color: busy || !valid ? "var(--btn-disabled-fg)" : "var(--on-clay)", border: "none", borderRadius: 8,
          fontSize: 14, fontWeight: 500,
          cursor: busy ? "wait" : "pointer",
          display: "inline-flex", alignItems: "center", gap: 8,
        }}>
          {busy && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }}/>}
          {busy ? "处理中…" : `确认充值 ¥${valid ? amountNum : 0}`}
        </button>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 10 }}>
          Mock 后端：直接入账。接真实后端后会跳转到支付网关。
        </div>
      </form>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px" }}>充值记录</h3>
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-3)" }}>
                <th style={th}>时间</th>
                <th style={th}>金额</th>
                <th style={th}>方式</th>
                <th style={th}>状态</th>
                <th style={th}>单号</th>
              </tr>
            </thead>
            <tbody>
              {history.loading && <tr><td colSpan="5" style={{ padding: 16, textAlign: "center" }}><Loading/></td></tr>}
              {(history.data?.recharges || []).length === 0 && !history.loading && (
                <tr><td colSpan="5" style={{ padding: 32, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>还没有充值记录。</td></tr>
              )}
              {(history.data?.recharges || []).map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--divider)" }}>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{fmtRelative(r.created_at)}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>¥{r.amount}</td>
                  <td style={td}>{METHODS.find((m) => m.id === r.method)?.name || r.method}</td>
                  <td style={td}><Pill tone="ok" dot>{r.status === "succeeded" ? "已到账" : r.status}</Pill></td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>{r.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const card = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 28 };
const mono10 = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)" };
const SectionLabel = ({ children }) => <div style={{ ...mono10, marginBottom: 12 }}>{children}</div>;
const th = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", textAlign: "left", padding: "10px 16px", fontWeight: 400 };
const td = { padding: "12px 16px", color: "var(--text)" };
