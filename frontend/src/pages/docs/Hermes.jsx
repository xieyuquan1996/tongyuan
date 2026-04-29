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

export default function HermesArticle() {
  const origin = useOrigin();
  return (
    <article>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay-press)", marginBottom: 8 }}>扩展接入</div>
      <h1 id="top" style={{ fontFamily: "var(--font-serif)", fontSize: 36, fontWeight: 700, margin: "8px 0 16px", letterSpacing: "-0.02em" }}>
        接入 Hermes Agent
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--text-2)", margin: "0 0 40px", maxWidth: 680 }}>
        <a href="https://github.com/NousResearch/hermes-agent" target="_blank" rel="noopener" style={{ color: "var(--clay-press)" }}>Hermes Agent</a>（Nous Research）认标准的 <code style={ic}>ANTHROPIC_BASE_URL</code> / <code style={ic}>ANTHROPIC_API_KEY</code> 环境变量，接入同源只需要在 shell rc 里写两行 export。
      </p>

      <h2 id="script" style={h2}>方式 A · 一键脚本（推荐）</h2>
      <p style={prose}>
        一条命令把两行 env 写进 <code style={ic}>~/.bashrc</code> / <code style={ic}>~/.zshrc</code>（有旧值会提示是否覆盖），幂等可重跑：
      </p>
      <Code language="BASH">{`curl -fsSL ${origin}/api/install/hermes | bash`}</Code>
      <p style={prose}>
        脚本会检测是否已经装过 <code style={ic}>hermes</code>。没装的话，它<strong>不会</strong>替你跑官方安装脚本 —— 因为 Hermes 官方安装脚本收尾会自动拉起聊天 TUI，会把后面的写入步骤劫持掉。脚本只写完 env 就退出，并提示你手动跑：
      </p>
      <Code language="BASH">{`curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash`}</Code>
      <p style={prose}>
        装完 TUI 起来时，Ctrl+C 退出，新开终端（env 已在 rc 里），直接 <code style={ic}>hermes</code> 就会走同源。免交互设密钥：<code style={ic}>HERMES_LINK_API_KEY=sk-relay-xxxxx curl … | bash</code>。
      </p>

      <h2 id="manual" style={h2}>方式 B · 手写配置</h2>
      <p style={prose}>
        在 <code style={ic}>~/.bashrc</code> / <code style={ic}>~/.zshrc</code> 末尾加两行：
      </p>
      <Code language="BASH">{`export ANTHROPIC_BASE_URL="${origin}"
export ANTHROPIC_API_KEY="sk-relay-xxxxxxxx"`}</Code>
      <p style={prose}>
        <code style={ic}>source</code> rc 或新开终端后，<code style={ic}>hermes</code> 就会把所有 Anthropic 流量发给同源。sk-relay-* 从
        <Link to="/dashboard/keys" style={{ color: "var(--clay-press)" }}> 控制台 → API 密钥 </Link>
        创建。
      </p>
      <p style={prose}>
        想验证生效：进 hermes TUI 后随便问一句，打开
        <Link to="/dashboard/logs" style={{ color: "var(--clay-press)" }}> 控制台 → 请求日志 </Link>
        能看到新记录就 OK。
      </p>

      <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--border)", display: "flex", gap: 24, fontSize: 14 }}>
        <Link to="/docs/openclaw" style={{ color: "var(--clay-press)", textDecoration: "none" }}>← 接入 OpenClaw</Link>
        <Link to="/docs/messages" style={{ color: "var(--clay-press)", textDecoration: "none", marginLeft: "auto" }}>Anthropic 原生接口 →</Link>
      </div>
    </article>
  );
}
