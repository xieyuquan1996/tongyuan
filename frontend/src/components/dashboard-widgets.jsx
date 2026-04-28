// Dashboard widgets: MetricCard, LatencyChart, RequestsTable, PageHeader.

import { useState } from "react";

export function PageHeader({ title, sub, right }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 24, gap: 16 }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 600, letterSpacing: "-0.015em", margin: "0 0 6px" }}>{title}</h1>
        {sub && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>{sub}</div>}
      </div>
      {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
    </div>
  );
}

export function MetricCard({ label, value, unit, delta, deltaTone, dark }) {
  const palette = dark
    ? { bg: "var(--surface-emphasis)", fg: "var(--text-on-emphasis)", sub: "var(--text-on-emphasis-3)", border: "transparent" }
    : { bg: "var(--surface-2)", fg: "var(--text)", sub: "var(--text-3)", border: "var(--border)" };
  const deltaColors = { up: dark ? "var(--text-on-emphasis-3)" : "var(--ok)", down: "var(--err)", neutral: dark ? "var(--text-on-emphasis-3)" : "var(--text-3)" };
  return (
    <div style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}`, borderRadius: 12, padding: 24 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: palette.sub, marginBottom: 12 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 36, fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{value}</span>
        {unit && <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: palette.sub }}>{unit}</span>}
      </div>
      {delta && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: deltaColors[deltaTone || "neutral"], marginTop: 8 }}>{delta}</div>}
    </div>
  );
}

export function LatencyChart({ series }) {
  const [range, setRange] = useState("30d");
  const full = series && series.length ? series : new Array(90).fill(300);
  const windowSize = { "7d": 7, "30d": 30, "90d": 90 }[range];
  const data = full.slice(-windowSize);
  const dataMax = Math.max(...data);
  const dataMin = Math.min(...data);
  const spread = dataMax - dataMin || dataMax || 500;
  const min = Math.max(0, Math.floor((dataMin - spread * 0.15) / 100) * 100);
  const max = Math.ceil((dataMax + spread * 0.15) / 100) * 100 || 500;
  const w = 880, h = 220, pad = { l: 48, r: 16, t: 16, b: 28 };
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const x = (i) => pad.l + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v) => pad.t + innerH - ((v - min) / (max - min || 1)) * innerH;
  const path = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  const area = `${path} L${x(data.length - 1)},${pad.t + innerH} L${x(0)},${pad.t + innerH} Z`;
  const gridStep = Math.ceil((max - min) / 4 / 100) * 100 || 100;
  const gridLines = Array.from({ length: 5 }, (_, i) => min + i * gridStep).filter((v) => v <= max);
  const tickStep = Math.max(1, Math.floor((data.length - 1) / 4));
  const tickIndices = [];
  for (let i = 0; i < data.length; i += tickStep) tickIndices.push(i);
  if (tickIndices[tickIndices.length - 1] !== data.length - 1) tickIndices.push(data.length - 1);
  const dotStep = Math.max(1, Math.floor(data.length / 12));
  const rangeLabel = { "7d": "过去 7 天", "30d": "过去 30 天", "90d": "过去 90 天" }[range];
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: 16, gap: 16, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>p99 延迟 · {rangeLabel}</h3>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>cn-east-1 · 单位 ms</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {["7d", "30d", "90d"].map((r) => {
            const active = r === range;
            return (
              <button key={r} onClick={() => setRange(r)} style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 12,
                background: active ? "var(--surface-inverse)" : "transparent",
                color: active ? "var(--text-on-inverse)" : "var(--text-2)",
                border: active ? "none" : "1px solid var(--border)",
                cursor: "pointer", fontFamily: "var(--font-mono)",
              }}>{r}</button>
            );
          })}
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 220 }}>
        {gridLines.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="var(--divider)" strokeDasharray="2 4" />
            <text x={pad.l - 8} y={y(v) + 4} fontFamily="var(--font-mono)" fontSize="10" fill="var(--text-3)" textAnchor="end">{v}</text>
          </g>
        ))}
        <path d={area} fill="var(--clay)" opacity="0.08" />
        <path d={path} fill="none" stroke="var(--clay)" strokeWidth="1.5" strokeLinejoin="round" />
        {data.map((v, i) => i % dotStep === 0 && <circle key={i} cx={x(i)} cy={y(v)} r="2" fill="var(--clay)" />)}
        {tickIndices.map((i) => (
          <text key={i} x={x(i)} y={h - 8} fontFamily="var(--font-mono)" fontSize="10" fill="var(--text-3)" textAnchor="middle">{`d-${data.length - 1 - i}`}</text>
        ))}
      </svg>
    </div>
  );
}

export function RequestsTable({ rows, onRowClick, compact }) {
  const dotColor = (s) => (s === 200 ? "var(--ok)" : s === 429 ? "var(--warn)" : "var(--err)");
  const visible = compact ? (rows || []).slice(0, 5) : rows || [];
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      {compact && (
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "baseline", gap: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>最近请求</h3>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>实时 · 全量审计</span>
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--surface-3)" }}>
            <th style={th}>状态</th>
            <th style={th}>请求 ID</th>
            <th style={th}>模型</th>
            <th style={th}>延迟</th>
            <th style={th}>Tokens</th>
            <th style={th}>时间</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr><td colSpan="6" style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>没有符合条件的请求。</td></tr>
          )}
          {visible.map((r) => (
            <tr
              key={r.id}
              onClick={() => onRowClick && onRowClick(r)}
              style={{ borderTop: "1px solid var(--divider)", cursor: onRowClick ? "pointer" : "default" }}
              onMouseEnter={(e) => onRowClick && (e.currentTarget.style.background = "var(--surface-3)")}
              onMouseLeave={(e) => onRowClick && (e.currentTarget.style.background = "transparent")}
            >
              <td style={{ ...td, fontFamily: "var(--font-mono)" }}>
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: dotColor(r.status), marginRight: 8 }} />
                {r.status}
              </td>
              <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{r.id}</td>
              <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{r.model}</td>
              <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{r.latency_ms ? r.latency_ms + "ms" : "—"}</td>
              <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{(r.tokens || 0).toLocaleString()}</td>
              <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>
                {new Date(r.created_at).toLocaleTimeString("zh-CN", { hour12: false })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", textAlign: "left", padding: "10px 16px", fontWeight: 400 };
const td = { padding: "12px 16px", color: "var(--text)" };
