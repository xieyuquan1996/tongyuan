import { useState } from "react";
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAsync } from "../../lib/hooks.js";
import { Loading, ErrorBox, Pill } from "../../components/primitives.jsx";
import { PageHeader } from "../../components/dashboard-widgets.jsx";

export default function Analytics() {
  const [range, setRange] = useState("30d");
  const { loading, data, error } = useAsync(() => api("/api/console/analytics?range=" + range), [range]);
  if (loading) return <Loading/>;
  if (error) return <ErrorBox error={error}/>;

  const reqTotal = data.daily.reduce((a, b) => a + b.requests, 0);
  const tokTotal = data.daily.reduce((a, b) => a + b.tokens, 0);
  const costTotal = data.daily.reduce((a, b) => a + parseFloat(b.cost), 0);

  return (
    <div>
      <PageHeader title="使用分析" sub="按模型 / 区域 / 错误类型拆分"
        right={
          <div style={{ display: "flex", gap: 6 }}>
            {["7d", "30d", "90d"].map((r) => (
              <button key={r} onClick={() => setRange(r)} style={{
                padding: "6px 12px", borderRadius: 6, fontSize: 12,
                background: r === range ? "var(--surface-inverse)" : "transparent",
                color: r === range ? "var(--text-on-inverse)" : "var(--text-2)",
                border: r === range ? "none" : "1px solid var(--border)",
                cursor: "pointer", fontFamily: "var(--font-mono)",
              }}>{r}</button>
            ))}
          </div>
        }
      />

      {/* Totals */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
        <TotalCard label="请求总数" value={(reqTotal / 1_000_000).toFixed(2) + "M"} delta="+12%" up/>
        <TotalCard label="Tokens" value={(tokTotal / 1_000_000_000).toFixed(2) + "B"} delta="+8%" up/>
        <TotalCard label="费用" value={"¥" + costTotal.toFixed(2)} delta="+15%" up/>
        <TotalCard label="一致率" value="100%" delta="字节级审计"/>
      </div>

      {/* Daily requests bars */}
      <Card title="每日请求量" sub="单位: 千次">
        <BarChart data={data.daily.map(d => d.requests / 1000)} labels={data.daily.map(d => d.date.slice(5))}/>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <Card title="按模型拆分">
          <BreakdownTable
            columns={["模型", "请求", "tokens", "费用", "占比"]}
            rows={data.by_model.map((m) => [
              <span style={{ fontFamily: "var(--font-mono)" }}>{m.model}</span>,
              m.requests.toLocaleString(),
              m.tokens_m.toLocaleString() + "M",
              m.cost,
              <BarPercent pct={m.share}/>,
            ])}
          />
        </Card>
        <Card title="按区域拆分">
          <BreakdownTable
            columns={["区域", "请求", "p99", "占比"]}
            rows={data.by_region.map((r) => [
              <span style={{ fontFamily: "var(--font-mono)" }}>{r.region}</span>,
              r.requests.toLocaleString(),
              r.p99 + "ms",
              <BarPercent pct={r.share}/>,
            ])}
          />
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="错误分布" sub="过去 30 天">
          <BreakdownTable
            columns={["类型", "次数", "占比", ""]}
            rows={data.errors.map((e) => [
              <span style={{ fontFamily: "var(--font-mono)" }}>{e.kind}</span>,
              e.count.toLocaleString(),
              e.pct,
              <Pill tone={e.kind.includes("rate") ? "warn" : e.kind.includes("5xx") ? "err" : "default"} dot>
                {e.kind.includes("rate") ? "限流" : e.kind.includes("5xx") ? "上游" : "鉴权"}
              </Pill>,
            ])}
          />
        </Card>
      </div>
    </div>
  );
}

function TotalCard({ label, value, delta, up }) {
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
      <div style={mono10}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 32, fontWeight: 500, marginTop: 6 }}>{value}</div>
      {delta && (
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 11, marginTop: 8,
          color: up ? "var(--ok)" : "var(--text-3)",
          display: "inline-flex", alignItems: "center", gap: 4,
        }}>
          {up && <TrendingUp size={11}/>}
          {delta}
        </div>
      )}
    </div>
  );
}

function Card({ title, sub, children }) {
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{title}</h3>
        {sub && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function BarChart({ data, labels }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...data, 1);
  const niceMax = niceCeil(max);
  const w = 880, h = 200, pad = { l: 44, r: 12, t: 16, b: 28 };
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const n = data.length;
  const gap = Math.max(2, Math.floor(innerW / n * 0.2));
  const barW = Math.max(2, (innerW - gap * (n - 1)) / n);
  const x = (i) => pad.l + i * (barW + gap);
  const y = (v) => pad.t + innerH - (v / niceMax) * innerH;
  const gridValues = [0, niceMax * 0.25, niceMax * 0.5, niceMax * 0.75, niceMax];
  const tickStep = Math.max(1, Math.floor((n - 1) / 5));
  const tickIndices = [];
  for (let i = 0; i < n; i += tickStep) tickIndices.push(i);
  if (tickIndices[tickIndices.length - 1] !== n - 1) tickIndices.push(n - 1);

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 200, display: "block" }}>
        {gridValues.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="var(--divider)" strokeDasharray="2 4" />
            <text x={pad.l - 8} y={y(v) + 4} fontFamily="var(--font-mono)" fontSize="10" fill="var(--text-3)" textAnchor="end">
              {fmtShort(v)}
            </text>
          </g>
        ))}
        {data.map((v, i) => {
          const isHover = hover === i;
          return (
            <rect
              key={i}
              x={x(i)}
              y={y(v)}
              width={barW}
              height={Math.max(1, innerH - (y(v) - pad.t))}
              rx={Math.min(2, barW / 3)}
              fill="var(--clay)"
              opacity={hover === null ? 0.82 : isHover ? 1 : 0.35}
              style={{ transition: "opacity 120ms var(--ease)" }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${labels[i]} · ${fmtShort(v)}`}</title>
            </rect>
          );
        })}
        {tickIndices.map((i) => (
          <text key={i} x={x(i) + barW / 2} y={h - 8}
            fontFamily="var(--font-mono)" fontSize="10" fill="var(--text-3)" textAnchor="middle">
            {labels[i]}
          </text>
        ))}
      </svg>
      {hover !== null && (
        <div style={{
          position: "absolute",
          left: `${((x(hover) + barW / 2) / w) * 100}%`,
          top: 0,
          transform: "translate(-50%, -100%)",
          padding: "4px 8px", borderRadius: 6,
          background: "var(--surface-3)",
          border: "1px solid var(--border)",
          fontFamily: "var(--font-mono)", fontSize: 11,
          color: "var(--text)",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          boxShadow: "var(--shadow-pop)",
        }}>
          <span style={{ color: "var(--text-3)" }}>{labels[hover]}</span>
          {" · "}
          <span style={{ fontWeight: 500 }}>{fmtShort(data[hover])}</span>
        </div>
      )}
    </div>
  );
}

function niceCeil(v) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  let nice;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * mag;
}

function fmtShort(v) {
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k";
  if (v >= 10) return v.toFixed(0);
  return v.toFixed(1);
}

function BreakdownTable({ columns, rows }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>{columns.map((c, i) => <th key={i} style={thStyle}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderTop: "1px solid var(--divider)" }}>
            {r.map((cell, j) => <td key={j} style={tdStyle}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BarPercent({ pct }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: "var(--surface-3)", borderRadius: 2, overflow: "hidden", minWidth: 60 }}>
        <div style={{ width: pct + "%", height: "100%", background: "var(--clay)" }}/>
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", minWidth: 32, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

const mono10 = {
  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em",
  textTransform: "uppercase", color: "var(--text-3)",
};
const thStyle = {
  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em",
  textTransform: "uppercase", color: "var(--text-3)",
  textAlign: "left", padding: "8px 12px", fontWeight: 400,
};
const tdStyle = { padding: "10px 12px", color: "var(--text)" };
