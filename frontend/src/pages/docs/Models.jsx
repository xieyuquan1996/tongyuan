import { useEffect, useState } from "react";
import { Breadcrumb, H1, H2, Lead, P, IC } from "./Layout.jsx";
import { api } from "../../lib/api.js";

export default function ModelsArticle() {
  const [models, setModels] = useState([]);
  useEffect(() => {
    api("/api/public/models").then((r) => setModels(r.models || []));
  }, []);
  return (
    <article>
      <Breadcrumb section="保真承诺" page="模型映射"/>
      <H1 id="top">模型映射</H1>
      <Lead>
        我们不做 alias。<IC>claude-opus-4.7</IC> 就是 <IC>claude-opus-4.7</IC>，永远不会偷偷指向旧模型。
      </Lead>

      <H2 id="list">当前支持的模型</H2>
      <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", margin: "16px 0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "var(--surface-3)" }}>
              <th style={th}>模型</th><th style={th}>上下文</th><th style={th}>I/O 价格</th><th style={th}>说明</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} style={{ borderTop: "1px solid var(--divider)" }}>
                <td style={{ ...td, fontFamily: "var(--font-mono)", fontWeight: 500 }}>{m.id}</td>
                <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>{m.context}</td>
                <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{m.price}</td>
                <td style={{ ...td, color: "var(--text-2)" }}>{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="snapshot">快照版本</H2>
      <P>
        Anthropic 会发布带日期后缀的快照，比如 <IC>claude-haiku-4-5-20251001</IC>。
        我们的计费表用 date-suffix 规则自动匹配到基础版本 — 你传快照版也能正确计费，不会出 <IC>unknown_model</IC> 错误。
      </P>

      <H2 id="deprecation">退役策略</H2>
      <P>Anthropic 宣布退役一个模型时，我们会在控制台 / 邮件 / <a href="/changelog" style={{ color: "var(--clay-press)" }}>更新日志</a> 里至少提前 30 天通知。退役后调用会返回 <IC>410 model_deprecated</IC>。</P>
    </article>
  );
}

const th = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", textAlign: "left", padding: "10px 16px", fontWeight: 400 };
const td = { padding: "12px 16px", color: "var(--text)" };
