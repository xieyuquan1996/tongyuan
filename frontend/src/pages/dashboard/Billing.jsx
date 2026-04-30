import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/hooks.js";
import { Loading, ErrorBox, Pill } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

export default function Billing() {
  const b = useAsync(() => api("/api/console/billing"), []);
  const inv = useAsync(() => api("/api/console/invoices"), []);
  if (b.loading || inv.loading) return <Loading />;
  if (b.error) return <ErrorBox error={b.error} />;
  const snap = b.data.billing;
  const used = parseFloat(snap.used.replace(/[^\d.]/g, ""));
  const limit = parseFloat(snap.limit.replace(/[^\d.]/g, ""));
  const pct = Math.min(100, Math.round((used / limit) * 100));

  return (
    <div>
      <PageHeader title="账单" sub={snap.month_label} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginBottom: 16 }}>
        <div style={{
          background: "var(--surface-2)", color: "var(--text)",
          borderRadius: 12, padding: 28, border: "1px solid var(--border)",
        }}>
          <div style={monoLabel}>本月已使用</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 56, fontWeight: 600, letterSpacing: "-0.02em" }}>{snap.used}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-3)" }}>/ 上限 {snap.limit}</span>
          </div>
          <div style={{ width: "100%", height: 6, background: "var(--track)", borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
            <div style={{ width: pct + "%", height: "100%", background: "var(--clay)" }} />
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
            预计本月: {snap.projection} · 下次结算: {snap.next_reset}
          </div>
        </div>
        {/* 暂时隐藏 - 套餐卡片
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 28 }}>
          <div style={monoLabel}>当前套餐</div>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{b.data.plan}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", marginBottom: 16 }}>按量计费 · 无最低消费</div>
          <Link to="/#pricing" style={{ ...ctaBtn, textDecoration: "none", display: "inline-block", textAlign: "center" }}>升级 / 管理</Link>
        </div>
        */}
      </div>

      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--divider)" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>近期发票</h3>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--surface-3)" }}>
              <th style={th}>账单期间</th>
              <th style={th}>金额</th>
              <th style={th}>状态</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {(inv.data?.invoices || []).map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--divider)" }}>
                <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{r.period}</td>
                <td style={{ ...td, fontFamily: "var(--font-mono)" }}>¥{r.amount}</td>
                <td style={td}><Pill tone="ok" dot>{r.status === "paid" ? "已支付" : r.status}</Pill></td>
                <td style={{ ...td, textAlign: "right" }}>
                  <a href="#" style={{ color: "var(--clay-press)", fontSize: 12, textDecoration: "none" }}>下载发票 →</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const monoLabel = {
  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em",
  textTransform: "uppercase", color: "var(--text-3)", marginBottom: 12,
};
const ctaBtn = {
  width: "100%", padding: "10px 16px", background: "var(--clay)", color: "var(--on-clay)",
  border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
};
const th = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", textAlign: "left", padding: "12px 20px", fontWeight: 400 };
const td = { padding: "12px 20px", color: "var(--text)" };
