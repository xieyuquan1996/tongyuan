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
const h3 = { fontSize: 16, fontWeight: 600, margin: "24px 0 8px" };
const prose = { fontSize: 15, lineHeight: 1.75, color: "var(--text-2)", margin: "0 0 16px", maxWidth: 680 };
const ic = { fontFamily: "var(--font-mono)", fontSize: 13, background: "var(--code-bg)", color: "var(--code-fg)", padding: "1px 5px", borderRadius: 4 };

export default function OpenClawArticle() {
  const origin = useOrigin();
  return (
    <article>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--clay-press)", marginBottom: 8 }}>扩展接入</div>
      <h1 id="top" style={{ fontFamily: "var(--font-serif)", fontSize: 36, fontWeight: 700, margin: "8px 0 16px", letterSpacing: "-0.02em" }}>
        接入 OpenClaw
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--text-2)", margin: "0 0 40px", maxWidth: 680 }}>
        <a href="https://github.com/openclaw/openclaw" target="_blank" rel="noopener" style={{ color: "var(--clay-press)" }}>OpenClaw</a>（Peter Steinberger）是一个本地优先的个人 AI 助手。它有自己的 provider registry，接入同源要走 <code style={ic}>models.providers</code> 通道。三种方式：一键脚本、交互式 onboarding，或直接编辑 <code style={ic}>~/.openclaw/openclaw.json</code>。
      </p>

      <h2 id="script" style={h2}>方式 A · 一键脚本（推荐）</h2>
      <p style={prose}>
        一条命令，按机器状态自动分叉：
      </p>
      <Code language="BASH">{`curl -fsSL ${origin}/api/install/openclaw | bash`}</Code>
      <div style={{ ...prose, paddingLeft: 0 }}>
        <ul style={{ paddingLeft: 20, margin: "0 0 16px" }}>
          <li style={{ marginBottom: 6 }}>
            <strong>首次安装</strong> — 脚本会用 nvm 装 Node 24（若系统 Node &lt; 22.14 或没装）、<code style={ic}>npm i -g openclaw@latest</code>，然后提示你跑一次官方向导 <code style={ic}>openclaw onboard --install-daemon</code>。向导是交互的（要注册 gateway daemon + 生成 auth token），没法被脚本悄悄替代，脚本会把要选的选项打印出来（Custom Provider / Base URL / Anthropic-compatible / 模型名），粘着走完就行。
          </li>
          <li>
            <strong>已经初始化过</strong> — 脚本直接合并 provider 进 <code style={ic}>~/.openclaw/openclaw.json</code>（时间戳备份、原子写、幂等），跑 <code style={ic}>openclaw gateway restart</code> 让改动生效。方便以后滚动密钥或者改模型。
          </li>
        </ul>
      </div>
      <p style={prose}>
        需要交互时会让你粘 <code style={ic}>sk-relay-*</code> 密钥。免交互：<code style={ic}>OPENCLAW_LINK_API_KEY=sk-relay-xxxxx curl … | bash</code>。默认模型 <code style={ic}>claude-opus-4-6</code>，用 <code style={ic}>OPENCLAW_MODEL</code> 覆盖。
      </p>

      <h2 id="onboard" style={h2}>方式 B · 交互式 onboarding</h2>
      <p style={prose}>
        跑官方向导，按提示一步步选：
      </p>
      <Code language="BASH">{`openclaw onboard --install-daemon`}</Code>
      <p style={prose}>
        重点步骤：
      </p>
      <div style={{ ...prose, paddingLeft: 0 }}>
        <ul style={{ paddingLeft: 20, margin: "0 0 16px" }}>
          <li style={{ marginBottom: 6 }}><strong>Model/auth provider</strong> — <code style={ic}>Custom Provider</code></li>
          <li style={{ marginBottom: 6 }}><strong>API Base URL</strong> — <code style={ic}>{origin}</code></li>
          <li style={{ marginBottom: 6 }}><strong>How do you want to provide this API key?</strong> — <code style={ic}>Paste API key now</code></li>
          <li style={{ marginBottom: 6 }}><strong>API Key</strong> — 粘贴控制台生成的 <code style={ic}>sk-relay-…</code></li>
          <li style={{ marginBottom: 6 }}><strong>Endpoint compatibility</strong> — <code style={ic}>Anthropic-compatible</code></li>
          <li style={{ marginBottom: 6 }}><strong>Model ID</strong> — <code style={ic}>claude-opus-4-6</code>（或其他同源支持的模型名）</li>
          <li style={{ marginBottom: 6 }}><strong>Endpoint ID</strong> — 保留默认，形如 <code style={ic}>custom-claude-link-jinni-life</code></li>
          <li><strong>Model alias</strong> — 可选，起个短名方便以后 <code style={ic}>/model</code> 切换</li>
        </ul>
      </div>
      <p style={prose}>
        走到 <code style={ic}>Verification successful</code> 就说明同源已经连通。走 <code style={ic}>Anthropic-compatible</code> 模式时，OpenClaw 会自动抑制 <code style={ic}>claude-code-20250219</code>、<code style={ic}>interleaved-thinking-*</code> 这类 beta header，避免代理返回 400。
      </p>

      <h2 id="manual" style={h2}>方式 C · 手写配置</h2>
      <p style={prose}>
        直接编辑 <code style={ic}>~/.openclaw/openclaw.json</code>，以下是 onboard 生成的最小结构（省略了与接入无关的 gateway/tools 段）：
      </p>
      <Code language="JSON">{`{
  "agents": {
    "defaults": {
      "models": {
        "custom-claude-link-jinni-life/claude-opus-4-6": {}
      },
      "model": {
        "primary": "custom-claude-link-jinni-life/claude-opus-4-6"
      }
    }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "custom-claude-link-jinni-life": {
        "baseUrl": "${origin}",
        "api": "anthropic-messages",
        "apiKey": "sk-relay-xxxxxxxx",
        "models": [
          {
            "id": "claude-opus-4-6",
            "name": "claude-opus-4-6 (Custom Provider)",
            "contextWindow": 200000,
            "maxTokens": 8192,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "reasoning": false
          }
        ]
      }
    }
  }
}`}</Code>
      <p style={prose}>
        写完后必须重启 gateway 才能生效：
      </p>
      <Code language="BASH">{`openclaw gateway restart`}</Code>
      <p style={prose}>
        几个容易踩的点：<code style={ic}>agents.defaults.models</code> 是<strong>允许清单</strong>，primary 指向的模型必须在里面出现；<code style={ic}>models.mode: "merge"</code> 让这份手写配置与 OpenClaw 自带的 provider 目录合并而不是替换；provider ID 形如 <code style={ic}>custom-&lt;域名&gt;</code> 是 onboard 自动生成的约定，自己改也行，但 primary 里要保持一致。
      </p>

      <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--border)", display: "flex", gap: 24, fontSize: 14 }}>
        <Link to="/docs/regions" style={{ color: "var(--clay-press)", textDecoration: "none" }}>← 区域选择</Link>
        <Link to="/docs/hermes" style={{ color: "var(--clay-press)", textDecoration: "none", marginLeft: "auto" }}>接入 Hermes Agent →</Link>
      </div>
    </article>
  );
}
