import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity } from "lucide-react";
import { LogoMark, Pill, Loading, ErrorBox } from "../components/primitives.jsx";
import { api } from "../lib/api.js";

export default function StatusPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api("/api/public/status").then(setData).catch(setErr);
  }, []);

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={topBar}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <LogoMark size={26}/>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 600 }}>同源</span>
          <span style={{ color: "var(--text-4)", margin: "0 4px" }}>/</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-2)" }}>status</span>
        </Link>
        <div style={{ marginLeft: "auto", display: "flex", gap: 14, fontSize: 14 }}>
          <Link to="/" style={{ color: "var(--text-2)", textDecoration: "none" }}>首页</Link>
          <Link to="/docs" style={{ color: "var(--text-2)", textDecoration: "none" }}>文档</Link>
          <Link to="/changelog" style={{ color: "var(--text-2)", textDecoration: "none" }}>更新日志</Link>
        </div>
      </header>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "64px 32px" }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em",
          textTransform: "uppercase", color: "var(--clay-press)", marginBottom: 16,
        }}>
          <span style={{ display: "inline-block", width: 24, height: 1, background: "var(--clay)", verticalAlign: "middle", marginRight: 12 }}/>
          SYSTEM STATUS
        </div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 48, fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 16px" }}>
          所有系统<span style={{ color: "var(--ok)" }}>正常</span>
        </h1>
        <p style={{ fontSize: 16, color: "var(--text-2)", marginBottom: 48 }}>
          页面每 60 秒自动刷新。订阅事件可以 <a href="#" style={{ color: "var(--clay-press)" }}>RSS</a> 或 <a href="#" style={{ color: "var(--clay-press)" }}>Webhook</a>。
        </p>

        {err && <ErrorBox error={err}/>}
        {!data && !err && <Loading/>}

        {data && (
          <>
            <SectionLabel>核心组件</SectionLabel>
            <Box>
              {data.components.map((c, i) => (
                <Row key={c.id} top={i > 0}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</span>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>{c.note}</div>
                  <div style={{ marginLeft: "auto" }}>
                    <Pill tone={c.status === "ok" ? "ok" : c.status === "warn" ? "warn" : "err"} dot>
                      {c.status === "ok" ? "正常" : c.status === "warn" ? "降级" : "故障"}
                    </Pill>
                  </div>
                </Row>
              ))}
            </Box>

            <SectionLabel>区域延迟</SectionLabel>
            <Box>
              {data.regions.map((r, i) => (
                <Row key={r.id} top={i > 0}>
                  <Activity size={14} color="var(--text-3)"/>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-2)", minWidth: 120 }}>{r.id}</span>
                  <span style={{ fontSize: 14 }}>{r.name}</span>
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 500 }}>{r.latency}</span>
                  <Pill tone={r.status === "ok" ? "ok" : "warn"} dot>
                    {r.status === "ok" ? "正常" : "降级"}
                  </Pill>
                </Row>
              ))}
            </Box>

            <SectionLabel>过去 90 天历史事件</SectionLabel>
            <div style={{
              background: "var(--surface-2)", border: "1px solid var(--border)",
              borderRadius: 12, padding: 32, textAlign: "center",
              color: "var(--text-3)", fontSize: 14,
            }}>
              过去 90 天内没有影响可用性的事件。
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em",
      textTransform: "uppercase", color: "var(--text-3)", margin: "40px 0 12px",
    }}>{children}</div>
  );
}
function Box({ children }) {
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      {children}
    </div>
  );
}
function Row({ children, top }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16,
      padding: "16px 20px",
      borderTop: top ? "1px solid var(--divider)" : "none",
    }}>{children}</div>
  );
}

const topBar = {
  height: 64, display: "flex", alignItems: "center",
  padding: "0 32px", gap: 24,
  borderBottom: "1px solid var(--border)",
  background: "var(--surface-2)",
};
