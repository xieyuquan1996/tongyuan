import { Link } from "react-router-dom";
import { Users, Activity, AlertTriangle, DollarSign, TrendingUp, Clock } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync, fmtRelative } from "../../lib/hooks.js";
import { Loading, ErrorBox, Pill } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

export default function AdminOverview() {
  const { loading, data, error } = useAsync(() => api("/api/admin/overview"), []);
  if (loading) return <Loading/>;
  if (error) return <ErrorBox error={error}/>;

  const m = data.metrics;
  const max = Math.max(1, ...data.daily.map((d) => d.requests));

  return (
    <div>
      <PageHeader title="平台概览" sub="所有租户的实时聚合视图"/>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
        <Metric icon={Users}      label="用户总数"    value={m.users_total}   sub={`活跃 ${m.users_active} · 7 日新增 ${m.users_new_7d}`}/>
        <Metric icon={Activity}   label="24H 请求"    value={m.requests_24h.toLocaleString()} sub={`错误 ${m.errors_24h} · 错误率 ${m.error_rate}`}/>
        <Metric icon={DollarSign} label="本月营收"    value={"¥" + Number(m.spent_30d).toLocaleString()} sub="全部租户合计"/>
        <Metric icon={TrendingUp} label="余额池"      value={"¥" + Number(m.balance_total).toLocaleString()} sub="用户未消费余额"/>
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>每日请求与错误</h3>
          <span style={mono11}>过去 30 天</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 16, fontFamily: "var(--font-mono)", fontSize: 11 }}>
            <Legend color="var(--clay)" label="请求"/>
            <Legend color="var(--err)"  label="错误"/>
          </div>
        </div>
        <Bars data={data.daily} max={max}/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "baseline", marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>最近审计</h3>
            <Link to="/admin/audit" style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--clay-press)", textDecoration: "none" }}>全部 →</Link>
          </div>
          {(data.recent_audit || []).length === 0 && <Empty text="还没有审计事件"/>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(data.recent_audit || []).map((e) => (
              <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13 }}>
                <Clock size={12} color="var(--text-3)" style={{ marginTop: 4 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div><code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--clay-press)" }}>{e.action}</code> <span style={{ color: "var(--text-3)" }}>·</span> <span style={{ fontFamily: "var(--font-mono)" }}>{e.target}</span></div>
                  <div style={mono11}>{e.actor} · {fmtRelative(e.at)} {e.note && "· " + e.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 16px" }}>快速入口</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <QuickLink to="/admin/users"         title="用户"    desc="搜索 / 冻结 / 调整配额"/>
            <QuickLink to="/admin/keys"          title="密钥"    desc="跨租户撤销"/>
            <QuickLink to="/admin/logs"          title="请求"    desc="跨租户审计"/>
            <QuickLink to="/admin/billing"       title="账单"    desc="营收 / 套餐分布"/>
            <QuickLink to="/admin/models"        title="模型"    desc="上下架 / 改价"/>
            <QuickLink to="/admin/regions"       title="区域"    desc="状态 / 延迟"/>
            <QuickLink to="/admin/announcements" title="公告"    desc="全站提示"/>
            <QuickLink to="/admin/audit"         title="审计"    desc="操作追溯"/>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, sub }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon size={14} color="var(--clay)"/>
        <span style={mono10}>{label}</span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 32, fontWeight: 500, letterSpacing: "-0.01em" }}>{value}</div>
      {sub && <div style={{ ...mono11, marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

function Bars({ data, max }) {
  const w = 900, h = 180, pad = { l: 36, r: 12, t: 10, b: 24 };
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const n = data.length;
  const gap = 3;
  const barW = Math.max(2, (innerW - gap * (n - 1)) / n);
  const x = (i) => pad.l + i * (barW + gap);
  const y = (v) => pad.t + innerH - (v / max) * innerH;
  const ticks = [0, max * 0.5, max];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 180 }}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="var(--divider)" strokeDasharray="2 4"/>
          <text x={pad.l - 6} y={y(v) + 4} fontFamily="var(--font-mono)" fontSize="10" fill="var(--text-3)" textAnchor="end">{Math.round(v)}</text>
        </g>
      ))}
      {data.map((d, i) => (
        <g key={i}>
          <rect x={x(i)} y={y(d.requests)} width={barW} height={innerH - (y(d.requests) - pad.t)} fill="var(--clay)" opacity="0.8" rx="1"/>
          {d.errors > 0 && (
            <rect x={x(i)} y={y(d.errors)} width={barW} height={innerH - (y(d.errors) - pad.t)} fill="var(--err)" opacity="0.85" rx="1"/>
          )}
          <title>{`${d.date} · ${d.requests} 请求 · ${d.errors} 错误`}</title>
        </g>
      ))}
      {data.filter((_, i) => i % 5 === 0 || i === data.length - 1).map((d, idx, arr) => {
        const i = data.indexOf(d);
        return (
          <text key={d.date} x={x(i) + barW / 2} y={h - 6} fontFamily="var(--font-mono)" fontSize="10" fill="var(--text-3)" textAnchor="middle">{d.date.slice(5)}</text>
        );
      })}
    </svg>
  );
}

function Legend({ color, label }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-3)" }}>
    <span style={{ width: 8, height: 8, borderRadius: 2, background: color }}/> {label}
  </span>;
}

function QuickLink({ to, title, desc }) {
  return (
    <Link to={to} style={{
      display: "block", padding: "12px 14px",
      border: "1px solid var(--border)", borderRadius: 8,
      textDecoration: "none", color: "var(--text)",
    }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{title} →</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{desc}</div>
    </Link>
  );
}

function Empty({ text }) {
  return <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>{text}</div>;
}

const card = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 };
const mono10 = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)" };
const mono11 = { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" };
