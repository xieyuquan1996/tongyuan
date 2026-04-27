import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LogoMark, Pill, Loading, ErrorBox } from "../components/primitives.jsx";
import { api } from "../lib/api.js";

const TAG_TONE = { feature: "clay", improvement: "ok", fix: "warn" };
const TAG_LABEL = { feature: "新功能", improvement: "优化", fix: "修复" };

export default function Changelog() {
  const [entries, setEntries] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api("/api/public/changelog").then((r) => setEntries(r.entries)).catch(setErr);
  }, []);

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{
        height: 64, display: "flex", alignItems: "center",
        padding: "0 32px", gap: 24,
        borderBottom: "1px solid var(--border)",
        background: "var(--surface-2)",
      }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <LogoMark size={26}/>
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 600 }}>同源</span>
          <span style={{ color: "var(--text-4)", margin: "0 4px" }}>/</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-2)" }}>changelog</span>
        </Link>
        <div style={{ marginLeft: "auto", display: "flex", gap: 14, fontSize: 14 }}>
          <Link to="/" style={{ color: "var(--text-2)", textDecoration: "none" }}>首页</Link>
          <Link to="/docs" style={{ color: "var(--text-2)", textDecoration: "none" }}>文档</Link>
          <Link to="/status" style={{ color: "var(--text-2)", textDecoration: "none" }}>状态</Link>
        </div>
      </header>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "64px 32px" }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em",
          textTransform: "uppercase", color: "var(--clay-press)", marginBottom: 16,
        }}>
          <span style={{ display: "inline-block", width: 24, height: 1, background: "var(--clay)", verticalAlign: "middle", marginRight: 12 }}/>
          更新日志
        </div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 48, fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 16px" }}>
          同源 发布记录
        </h1>
        <p style={{ fontSize: 16, color: "var(--text-2)", marginBottom: 48 }}>
          按时间倒序。重要更新会在控制台里横幅提示。
        </p>

        {err && <ErrorBox error={err}/>}
        {!entries && !err && <Loading/>}

        {entries && entries.map((e) => (
          <div key={e.date + e.title} style={{
            display: "grid", gridTemplateColumns: "120px 1fr",
            gap: 32, padding: "24px 0",
            borderTop: "1px solid var(--divider)",
          }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>{e.date}</div>
              <div style={{ marginTop: 8 }}>
                <Pill tone={TAG_TONE[e.tag] || "default"}>{TAG_LABEL[e.tag] || e.tag}</Pill>
              </div>
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px", letterSpacing: "-0.01em" }}>{e.title}</h3>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text-2)", margin: 0 }}>{e.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
