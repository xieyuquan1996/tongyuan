import { useState } from "react";
import { Settings2, Gift } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/hooks.js";
import { Loading, ErrorBox } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

export default function AdminSettings() {
  const { loading, data, error, reload } = useAsync(() => api("/api/admin/settings"), []);
  const [rate, setRate] = useState("");
  const [credit, setCredit] = useState("");
  const [savingRate, setSavingRate] = useState(false);
  const [savingCredit, setSavingCredit] = useState(false);
  const [rateMsg, setRateMsg] = useState(null);
  const [creditMsg, setCreditMsg] = useState(null);

  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  const currentRate = data.usd_to_cny;
  const currentCredit = data.signup_credit_usd;
  const currentCreditCny = (currentCredit * currentRate).toFixed(2);

  async function saveRate(e) {
    e.preventDefault();
    const val = parseFloat(rate);
    if (!Number.isFinite(val) || val <= 0) { setRateMsg({ ok: false, text: "请输入有效汇率" }); return; }
    setSavingRate(true);
    setRateMsg(null);
    try {
      await api("/api/admin/settings", { method: "PUT", body: { usd_to_cny: val } });
      setRateMsg({ ok: true, text: `汇率已更新为 ${val}` });
      setRate("");
      reload();
    } catch (err) {
      setRateMsg({ ok: false, text: err.message || "保存失败" });
    } finally {
      setSavingRate(false);
    }
  }

  async function saveCredit(e) {
    e.preventDefault();
    const val = parseFloat(credit);
    if (!Number.isFinite(val) || val < 0) { setCreditMsg({ ok: false, text: "请输入有效金额（0 或更大）" }); return; }
    setSavingCredit(true);
    setCreditMsg(null);
    try {
      await api("/api/admin/settings", { method: "PUT", body: { signup_credit_usd: val } });
      setCreditMsg({ ok: true, text: `注册赠送额度已更新为 $${val}` });
      setCredit("");
      reload();
    } catch (err) {
      setCreditMsg({ ok: false, text: err.message || "保存失败" });
    } finally {
      setSavingCredit(false);
    }
  }

  return (
    <div>
      <PageHeader title="平台设置" sub="全局参数配置" />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <Settings2 size={18} color="var(--clay)" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>汇率设置</h3>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={label}>当前汇率（USD → CNY）</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 500, color: "var(--text)" }}>
              1 USD = ¥{currentRate}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>
              所有人民币展示金额均基于此汇率换算，修改后立即生效（60 秒缓存）
            </div>
          </div>

          <form onSubmit={saveRate} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <div style={label}>新汇率</div>
              <input
                type="number"
                step="0.01"
                min="1"
                max="100"
                placeholder={String(currentRate)}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <button type="submit" disabled={savingRate || !rate} style={btnStyle(savingRate || !rate)}>
              {savingRate ? "保存中…" : "保存"}
            </button>
          </form>

          {rateMsg && <MsgBox msg={rateMsg} />}
        </div>

        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <Gift size={18} color="var(--clay)" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>新用户注册赠送</h3>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={label}>当前赠送额度</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 500, color: "var(--text)" }}>
              ${currentCredit.toFixed(2)}
              <span style={{ fontSize: 14, color: "var(--text-3)", marginLeft: 10 }}>
                ≈ ¥{currentCreditCny}
              </span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>
              新用户完成注册时自动入账，写入计费流水（kind = credit_signup）。设为 0 即可关闭赠送。
            </div>
          </div>

          <form onSubmit={saveCredit} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <div style={label}>新赠送额度（USD）</div>
              <input
                type="number"
                step="0.01"
                min="0"
                max="10000"
                placeholder={String(currentCredit)}
                value={credit}
                onChange={(e) => setCredit(e.target.value)}
                style={inputStyle}
              />
            </div>
            <button type="submit" disabled={savingCredit || credit === ""} style={btnStyle(savingCredit || credit === "")}>
              {savingCredit ? "保存中…" : "保存"}
            </button>
          </form>

          {creditMsg && <MsgBox msg={creditMsg} />}
        </div>
      </div>
    </div>
  );
}

function MsgBox({ msg }) {
  return (
    <div style={{
      marginTop: 12, padding: "10px 14px", borderRadius: 6, fontSize: 13,
      background: msg.ok ? "var(--ok-soft)" : "var(--err-soft)",
      color: msg.ok ? "var(--ok)" : "var(--err)",
      border: `1px solid ${msg.ok ? "var(--ok)" : "var(--err)"}`,
    }}>
      {msg.text}
    </div>
  );
}

const card = {
  background: "var(--surface-2)", border: "1px solid var(--border)",
  borderRadius: 12, padding: 24, maxWidth: 480,
};
const label = {
  fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em",
  textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8,
};
const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--surface-1)",
  color: "var(--text)", fontSize: 14, fontFamily: "var(--font-mono)",
  boxSizing: "border-box",
};
const btnStyle = (disabled) => ({
  padding: "10px 20px", borderRadius: 8, border: "none",
  background: disabled ? "var(--btn-disabled-bg)" : "var(--clay)",
  color: disabled ? "var(--btn-disabled-fg)" : "var(--on-clay)",
  fontSize: 14, fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer",
  whiteSpace: "nowrap",
});
