import { Link } from "react-router-dom";
import { Code } from "./Layout.jsx";

const h2 = { fontSize: 22, fontWeight: 600, margin: "40px 0 12px", letterSpacing: "-0.01em" };
const prose = { fontSize: 15, lineHeight: 1.75, color: "var(--text-2)", margin: "0 0 16px", maxWidth: 680 };
const ic = { fontFamily: "var(--font-mono)", fontSize: 13, background: "var(--code-bg)", color: "var(--code-fg)", padding: "1px 5px", borderRadius: 4 };

export default function ProvidersArticle() {
  return (
    <article>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay-press)", marginBottom: 8 }}>扩展接入</div>
      <h1 id="top" style={{ fontFamily: "var(--font-serif)", fontSize: 36, fontWeight: 700, margin: "8px 0 16px", letterSpacing: "-0.02em" }}>
        接入第三方模型
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--text-2)", margin: "0 0 40px", maxWidth: 680 }}>
        同源支持将任何兼容 Anthropic API 格式的上游接入密钥池。管理员在后台配置好 Base URL 和 Key 后，用户侧无需任何改动。
      </p>

      <h2 id="lobster" style={h2}>龙虾（Lobster）</h2>
      <p style={prose}>
        Lobster 是一个兼容 Anthropic SDK 格式的第三方中转服务。接入方式：在后台管理 → 上游密钥 → 添加密钥，填入：
      </p>
      <Code language="TEXT">{`别名:       lobster-key-1
API Key:    sk-lob-xxxxxxxxxxxxxxxx
Base URL:   https://api.lobsterapi.com   （以实际地址为准）
优先级:     50   （数字越小越优先）`}</Code>
      <p style={prose}>
        添加后网关会按优先级自动调度。Lobster 支持的模型 ID 需在后台 → 模型 页面手动上架，填写对应的模型 ID 即可。
      </p>

      <h2 id="hermes" style={h2}>爱马仕（Hermes）</h2>
      <p style={prose}>
        Hermes 同样提供 Anthropic 兼容接口。配置方式与 Lobster 相同，只需替换 Base URL 和 Key：
      </p>
      <Code language="TEXT">{`别名:       hermes-key-1
API Key:    sk-hrm-xxxxxxxxxxxxxxxx
Base URL:   https://api.hermes-ai.com   （以实际地址为准）
优先级:     60`}</Code>

      <h2 id="how" style={h2}>工作原理</h2>
      <p style={prose}>
        每个上游密钥可以绑定独立的 Base URL。网关在转发请求时，会用该密钥对应的 Base URL 替换默认的 <code style={ic}>https://api.anthropic.com</code>，其余请求头和 Body 保持不变。
      </p>
      <p style={prose}>
        只要第三方服务实现了 Anthropic 的 <code style={ic}>POST /v1/messages</code> 接口格式，就可以无缝接入。
      </p>

      <h2 id="failover" style={h2}>多源自动切换</h2>
      <p style={prose}>
        可以同时配置多个上游密钥（不同 Base URL），网关按优先级顺序尝试。某个上游返回 429 或 5xx 时自动进入冷却，切换到下一个。
      </p>
      <Code language="TEXT">{`优先级 10 → anthropic-official（官方 Key）
优先级 50 → lobster-key-1
优先级 60 → hermes-key-1`}</Code>
      <p style={prose}>
        官方 Key 优先，备用源兜底，用户侧完全无感知。
      </p>

      <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--border)", display: "flex", gap: 24, fontSize: 14 }}>
        <Link to="/docs/auth" style={{ color: "var(--clay-press)", textDecoration: "none" }}>← 认证与密钥</Link>
        <Link to="/docs/regions" style={{ color: "var(--clay-press)", textDecoration: "none", marginLeft: "auto" }}>区域选择 →</Link>
      </div>
    </article>
  );
}
