import { api } from "../../lib/api.js";
import { useAsync, fmtRelative } from "../../lib/hooks.js";
import { Loading, ErrorBox, Pill } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

export default function AdminBilling() {
  const { loading, data, error } = useAsync(() => api("/api/admin/billing"), []);
  if (loading) return <Loading/>;
  if (error) return <ErrorBox error={error}/>;
  const t = data.totals;

  return (
    <div>
      <PageHeader title="账单 · 平台视图" sub="所有租户的收入 / 余额 / 发票"/>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
        <Metric label="本月营收" value={"¥" + Number(t.revenue_this_month).toLocaleString()} sub="租户消费合计"/>
        <Metric label="待结余额" value={"¥" + Number(t.balance_outstanding).toLocaleString()} sub="尚未消费的充值"/>
        <Metric label="待处理发票" value={t.pending_invoices} sub="status=pending" accent={t.pending_invoices > 0}/>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <h3 style={heading}>按套餐拆分</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr><th style={th}>套餐</th><th style={th}>用户数</th><th style={th}>本月收入</th><th style={th}>占比</th></tr>
          </thead>
          <tbody>
            {data.by_plan.map((p) => {
              const total = data.by_plan.reduce((a, b) => a + parseFloat(b.revenue), 0) || 1;
              const pct = Math.round(parseFloat(p.revenue) / total * 100);
              return (
                <tr key={p.plan} style={{ borderTop: "1px solid var(--divider)" }}>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", fontWeight: 500 }}>{p.plan}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{p.count}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>¥{Number(p.revenue).toLocaleString()}</td>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: "var(--track)", borderRadius: 2, overflow: "hidden", minWidth: 80 }}>
                        <div style={{ width: pct + "%", height: "100%", background: "var(--clay)" }}/>
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", minWidth: 32, textAlign: "right" }}>{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <h3 style={heading}>消费 Top 租户</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>账户</th>
              <th style={th}>套餐</th>
              <th style={th}>余额</th>
              <th style={th}>本月消费</th>
              <th style={th}>上限</th>
              <th style={th}>状态</th>
            </tr>
          </thead>
          <tbody>
            {data.by_user.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid var(--divider)" }}>
                <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12 }}>{u.email}</td>
                <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{u.plan}</td>
                <td style={{ ...td, fontFamily: "var(--font-mono)" }}>¥{u.balance}</td>
                <td style={{ ...td, fontFamily: "var(--font-mono)" }}>¥{u.spent_this_month}</td>
                <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>¥{u.limit_this_month}</td>
                <td style={td}>{u.status === "suspended" ? <Pill tone="err" dot>已冻结</Pill> : <Pill tone="ok" dot>活跃</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={card}>
          <h3 style={heading}>近期发票</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr><th style={th}>单号</th><th style={th}>期间</th><th style={th}>金额</th><th style={th}>状态</th></tr></thead>
            <tbody>
              {data.invoices.map((i) => (
                <tr key={i.id} style={{ borderTop: "1px solid var(--divider)" }}>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12 }}>{i.id}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{i.period}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>¥{i.amount}</td>
                  <td style={td}>
                    <Pill tone={i.status === "paid" ? "ok" : i.status === "pending" ? "warn" : "default"} dot>
                      {i.status === "paid" ? "已支付" : i.status === "pending" ? "待处理" : i.status}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={card}>
          <h3 style={heading}>近期充值</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr><th style={th}>单号</th><th style={th}>金额</th><th style={th}>方式</th><th style={th}>时间</th></tr></thead>
            <tbody>
              {data.recharges.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--divider)" }}>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12 }}>{r.id}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>¥{r.amount}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>{r.method}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>{fmtRelative(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, sub, accent }) {
  return (
    <div style={card}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 10 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 500, color: accent ? "var(--clay-press)" : "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

const card = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 };
const heading = { fontSize: 15, fontWeight: 600, margin: "0 0 12px" };
const th = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", textAlign: "left", padding: "8px 12px", fontWeight: 400 };
const td = { padding: "10px 12px", color: "var(--text)" };
