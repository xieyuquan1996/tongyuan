import { useState } from "react";
import { Settings2 } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/hooks.js";
import { Loading, ErrorBox } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

export default function AdminSettings() {
  const { loading, data, error, reload } = useAsync(() => api("/api/admin/settings"), []);
  const [rate, setRate] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  const current = data.usd_to_cny;

  async function save(e) {
    e.preventDefault();
    const val = parseFloat(rate);
    if (!Number.isFinite(val) || val <= 0) { setMsg({ ok: false, text: "请输入有效汇率" }); return; }
    setSaving(true);
    setMsg(null);
    try {
      await api("/api/admin/settings", { method: "PUT", body: { usd_to_cny: val } });
      setMsg({ ok: true, text: `汇率已更新为 ${val}` });
      setRate("");
      reload();
    } catch (err) {
      setMsg({ ok: false, text: err.message || "保存失败" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="平台设置" sub="全局参数配置" />

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <Settings2 size={18} color="var(--clay)" />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>汇率设置</h3>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={label}>当前汇率（USD → CNY）</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 500, color: "var(--text)" }}>
            1 USD = ¥{current}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>
            所有人民币展示金额均基于此汇率换算，修改后立即生效（60 秒缓存）
          </div>
        </div>

        <form onSubmit={save} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <div style={label}>新汇率</div>
            <input
              type="number"
              step="0.01"
              min="1"
              max="100"
              placeholder={String(current)}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              style={inputStyle}
            />
          </div>
          <button type="submit" disabled={saving || !rate} style={btnStyle(saving || !rate)}>
            {saving ? "保存中…" : "保存"}
          </button>
        </form>

        {msg && (
          <div style={{
            marginTop: 12, padding: "10px 14px", borderRadius: 6, fontSize: 13,
            background: msg.ok ? "var(--ok-soft)" : "var(--err-soft)",
            color: msg.ok ? "var(--ok)" : "var(--err)",
            border: `1px solid ${msg.ok ? "var(--ok)" : "var(--err)"}`,
          }}>
            {msg.text}
          </div>
        )}
      </div>
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
