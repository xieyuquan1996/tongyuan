import { useState, useEffect } from "react";
import { Terminal, KeyRound, Monitor, Apple, Check, AlertCircle } from "lucide-react";
import { Breadcrumb, H1, H2, Lead, P, IC, Code } from "./Layout.jsx";

// Everything here references the origin the user is viewing. No hard-coded
// domain — whatever the operator deploys to (localhost:5174, cg.jinni.life,
// your-own.example.com) is the same URL the install scripts ship with.
function useOrigin() {
  const [origin, setOrigin] = useState("https://your-relay.example.com");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);
  return origin;
}

const OS_TABS = [
  { id: "linux", label: "Linux", Icon: Terminal },
  { id: "mac", label: "macOS", Icon: Apple },
  { id: "win", label: "Windows", Icon: Monitor },
];

export default function ClaudeCodeArticle() {
  const origin = useOrigin();
  const [os, setOs] = useState("linux");

  const installCmd = os === "win"
    ? `irm ${origin}/api/install.ps1 | iex`
    : `curl -fsSL ${origin}/api/install | bash`;

  const envExport = os === "win"
    ? `$env:ANTHROPIC_BASE_URL = "${origin}"
$env:ANTHROPIC_API_KEY = "sk-relay-your-key"
claude`
    : `export ANTHROPIC_BASE_URL=${origin}
export ANTHROPIC_API_KEY=sk-relay-your-key
claude`;

  const codeLang = os === "win" ? "POWERSHELL" : "BASH";

  return (
    <article>
      <Breadcrumb section="入门" page="接入 Claude Code" />
      <H1 id="top">接入 Claude Code</H1>
      <Lead>
        两种方式任选其一。如果本机还没有 Claude Code，走方式 A；已经装好了、只想切换中转，走方式 B。
      </Lead>

      <OsPicker value={os} onChange={setOs} />

      <TwoWays>
        <Way
          id="install"
          tag="方式 A"
          recommended
          title="一条命令装好"
          subtitle="装 Claude Code 并把 ANTHROPIC_BASE_URL 写进 rc 文件"
        >
          <Code language={codeLang}>{installCmd}</Code>
          <P>
            完成后在新终端敲 <IC>claude</IC> 启动。<IC>ANTHROPIC_API_KEY</IC> 需要你手动设一次
            —— 它是 per-user 的 <IC>sk-relay-*</IC>，安装脚本不会替你填。
          </P>
        </Way>

        <Way
          id="manual"
          tag="方式 B"
          title="手动导两行环境变量"
          subtitle="已经装过 Claude Code，只想切换网关"
        >
          <Code language={codeLang}>{envExport}</Code>
          <P>
            把 <IC>sk-relay-your-key</IC> 换成
            <a href="/dashboard/keys" style={{ color: "var(--clay-press)" }}> 控制台 → API 密钥 </a>
            里创建的那把即可。
          </P>
        </Way>
      </TwoWays>

      <PromptsNotice />

      <H2 id="verify">验证接入成功</H2>
      <P>在任意项目目录下运行：</P>
      <Code language="BASH">{`cd your-project
claude "帮我总结这个仓库干了什么"`}</Code>
      <P>
        第一次回答出现后，打开
        <a href="/dashboard/logs" style={{ color: "var(--clay-press)" }}> 控制台 → 请求日志</a>，
        就能看到新记录；<IC>audit_match</IC> 一栏为绿色对勾，即证明我们把你发出的请求一字不改转给了 Anthropic。
      </P>

      <H2 id="troubleshoot">常见问题</H2>
      <FAQ
        items={[
          {
            q: "claude 命令找不到",
            a: <>重开一个终端让新 rc 生效；或手动 <IC>source ~/.bashrc</IC> / <IC>source ~/.zshrc</IC>。Windows 重开 PowerShell。</>,
          },
          {
            q: "401 unauthorized",
            a: <>检查 <IC>ANTHROPIC_API_KEY</IC> 是不是 <IC>sk-relay-</IC> 开头的那把，而不是 Anthropic 原生的 <IC>sk-ant-*</IC>。我们不接受 sk-ant 直连。</>,
          },
          {
            q: "第一次提示里不小心选了 No",
            a: <>退出 claude，删掉 <IC>~/.config/claude/config.json</IC>（Windows 是 <IC>%APPDATA%\\claude\\config.json</IC>），重新启动再选一次。</>,
          },
        ]}
      />
    </article>
  );
}

/* ---------- layout primitives local to this page ---------- */

function OsPicker({ value, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="操作系统"
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 3,
        margin: "24px 0 8px",
        borderRadius: 10,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      {OS_TABS.map(({ id, label, Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 14px",
              fontSize: 13,
              fontWeight: active ? 500 : 400,
              fontFamily: "inherit",
              color: active ? "var(--text)" : "var(--text-2)",
              background: active ? "var(--paper)" : "transparent",
              border: "none",
              borderRadius: 7,
              cursor: "pointer",
              boxShadow: active ? "var(--shadow-pop)" : "none",
              transition: "background 140ms ease, color 140ms ease, box-shadow 140ms ease",
            }}
          >
            <Icon size={14} strokeWidth={1.5} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function TwoWays({ children }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        margin: "24px 0 32px",
      }}
    >
      {children}
    </div>
  );
}

function Way({ id, tag, title, subtitle, recommended, children }) {
  return (
    <section
      id={id}
      style={{
        position: "relative",
        padding: "20px 24px 16px",
        background: "var(--surface-1)",
        border: `1px solid ${recommended ? "var(--clay)" : "var(--border)"}`,
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            padding: "1px 8px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: recommended ? "var(--clay-press)" : "var(--text-3)",
            background: recommended ? "var(--clay-soft)" : "var(--surface-3)",
            borderRadius: 4,
          }}
        >
          {tag}
        </span>
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--font-serif)",
            fontSize: 20,
            fontWeight: 600,
            lineHeight: 1.3,
          }}
        >
          {title}
        </h3>
        <span style={{ fontSize: 13, color: "var(--text-3)" }}>{subtitle}</span>
        {recommended && (
          <span
            style={{
              marginLeft: "auto",
              padding: "2px 10px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--paper)",
              background: "var(--clay)",
              borderRadius: 999,
            }}
          >
            推荐
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function PromptsNotice() {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: "16px 18px",
        margin: "0 0 40px",
        background: "var(--warn-soft)",
        border: "1px solid var(--border)",
        borderLeft: "3px solid var(--warn)",
        borderRadius: 8,
      }}
    >
      <AlertCircle size={18} strokeWidth={1.5} color="var(--warn-text)" style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--warn-text)", marginBottom: 6 }}>
          首次运行 claude 会问你两件事，都要选对
        </div>
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5, lineHeight: 1.6 }}>
          <li style={{ display: "flex", gap: 8 }}>
            <Check size={16} strokeWidth={2} color="var(--ok)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <IC>Do you trust the files in this folder?</IC>
              <span style={{ color: "var(--text-2)" }}> → 选 </span>
              <b>YES</b>
            </div>
          </li>
          <li style={{ display: "flex", gap: 8 }}>
            <Check size={16} strokeWidth={2} color="var(--ok)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <IC>Detected a custom API key... Do you want to use this API key?</IC>
              <span style={{ color: "var(--text-2)" }}> → 选 </span>
              <b>1. Yes</b>
              <span style={{ color: "var(--text-3)" }}>（默认是 No，选错就用不上中转）</span>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}

function FAQ({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 12, marginBottom: 8 }}>
      {items.map((it, i) => (
        <details
          key={i}
          style={{
            padding: "14px 16px",
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              color: "var(--text)",
              listStyle: "none",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <KeyRound size={14} strokeWidth={1.5} color="var(--clay-press)" />
            {it.q}
          </summary>
          <div style={{ marginTop: 10, paddingLeft: 24, fontSize: 13.5, lineHeight: 1.65, color: "var(--text-2)" }}>
            {it.a}
          </div>
        </details>
      ))}
    </div>
  );
}
