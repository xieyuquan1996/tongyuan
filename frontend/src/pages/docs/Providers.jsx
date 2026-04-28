import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Code } from "./Layout.jsx";

function useOrigin() {
  const [origin, setOrigin] = useState("https://your-domain.com");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);
  return origin;
}

const h2 = { fontSize: 22, fontWeight: 600, margin: "40px 0 12px", letterSpacing: "-0.01em" };
const prose = { fontSize: 15, lineHeight: 1.75, color: "var(--text-2)", margin: "0 0 16px", maxWidth: 680 };
const ic = { fontFamily: "var(--font-mono)", fontSize: 13, background: "var(--code-bg)", color: "var(--code-fg)", padding: "1px 5px", borderRadius: 4 };

export default function ProvidersArticle() {
  const origin = useOrigin();
  return (
    <article>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay-press)", marginBottom: 8 }}>扩展接入</div>
      <h1 id="top" style={{ fontFamily: "var(--font-serif)", fontSize: 36, fontWeight: 700, margin: "8px 0 16px", letterSpacing: "-0.02em" }}>
        在第三方工具里使用同源
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--text-2)", margin: "0 0 40px", maxWidth: 680 }}>
        任何使用 Anthropic SDK 的工具，只需设置两个环境变量，就能把请求路由到同源。以下是两个常见工具的接入示例。
      </p>

      <h2 id="lobster" style={h2}>OpenClaw（龙虾）</h2>
      <p style={prose}>
        <a href="https://github.com/openclaw/openclaw" target="_blank" rel="noopener" style={{ color: "var(--clay-press)" }}>OpenClaw</a> 是一个本地优先的 AI 助手，支持 WhatsApp、Telegram、Slack 等 20+ 平台。它底层调用 Anthropic SDK，因此直接设置环境变量即可接入同源：
      </p>
      <Code language="BASH">{`export ANTHROPIC_BASE_URL=${origin}
export ANTHROPIC_API_KEY=sk-relay-xxxxxxxx`}</Code>
      <p style={prose}>
        或者在 OpenClaw 的配置文件 <code style={ic}>~/.openclaw/openclaw.json</code> 里指定模型：
      </p>
      <Code language="JSON">{`{
  "agent": {
    "model": "anthropic/claude-sonnet-4-6"
  }
}`}</Code>
      <p style={prose}>
        设置好环境变量后，OpenClaw 的所有 Claude 请求都会经过同源转发，享受多 Key 池高可用和审计哈希保证。
      </p>

      <h2 id="hermes" style={h2}>Hermes Agent（爱马仕）</h2>
      <p style={prose}>
        <a href="https://github.com/nousresearch/hermes-agent" target="_blank" rel="noopener" style={{ color: "var(--clay-press)" }}>Hermes Agent</a> 是 Nous Research 开发的自进化 AI Agent，支持 CLI、Telegram、Discord 等多平台。接入同源同样只需两步：
      </p>
      <Code language="BASH">{`# 写入 ~/.hermes/.env
ANTHROPIC_BASE_URL=${origin}
ANTHROPIC_API_KEY=sk-relay-xxxxxxxx`}</Code>
      <p style={prose}>
        或者通过 Hermes 的配置命令：
      </p>
      <Code language="BASH">{`hermes config set model.provider anthropic
hermes config set model.default claude-sonnet-4-6`}</Code>
      <p style={prose}>
        Hermes 会自动读取 <code style={ic}>ANTHROPIC_API_KEY</code> 和 <code style={ic}>ANTHROPIC_BASE_URL</code>，无需其他改动。
      </p>

      <h2 id="how" style={h2}>通用原理</h2>
      <p style={prose}>
        Anthropic 官方 SDK（Python / TypeScript）都支持通过环境变量覆盖 Base URL：
      </p>
      <Code language="BASH">{`export ANTHROPIC_BASE_URL=${origin}
export ANTHROPIC_API_KEY=sk-relay-xxxxxxxx`}</Code>
      <p style={prose}>
        任何基于 Anthropic SDK 构建的工具，无论是 Claude Code、OpenClaw、Hermes 还是你自己的脚本，设置这两个变量后请求就会自动路由到同源。你的 <code style={ic}>sk-relay-*</code> 密钥从控制台 → API 密钥 页面创建。
      </p>

      <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--border)", display: "flex", gap: 24, fontSize: 14 }}>
        <Link to="/docs/auth" style={{ color: "var(--clay-press)", textDecoration: "none" }}>← 认证与密钥</Link>
        <Link to="/docs/regions" style={{ color: "var(--clay-press)", textDecoration: "none", marginLeft: "auto" }}>区域选择 →</Link>
      </div>
    </article>
  );
}
