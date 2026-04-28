import { useState } from "react";
import { Breadcrumb, H1, H2, Lead, P, IC, Code, Callout } from "./Layout.jsx";

const INSTALL_CMDS = {
  linux: "curl -fsSL https://cg.jinni.life/api/install | bash",
  mac: "curl -fsSL https://cg.jinni.life/api/install | bash",
  win: 'powershell -c "irm https://cg.jinni.life/api/install.ps1 | iex"',
};

const ENV_EXPORT = {
  linux: `export ANTHROPIC_BASE_URL=https://cg.jinni.life/anthropic
export ANTHROPIC_API_KEY=sk-relay-your-key
claude`,
  mac: `export ANTHROPIC_BASE_URL=https://cg.jinni.life/anthropic
export ANTHROPIC_API_KEY=sk-relay-your-key
claude`,
  win: `$env:ANTHROPIC_BASE_URL = "https://cg.jinni.life/anthropic"
$env:ANTHROPIC_API_KEY = "sk-relay-your-key"
claude`,
};

export default function ClaudeCodeArticle() {
  const [os, setOs] = useState("linux");
  const tabStyle = (active) => ({
    padding: "6px 14px",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    letterSpacing: "0.04em",
    background: active ? "var(--surface-3)" : "transparent",
    color: active ? "var(--text)" : "var(--text-3)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    cursor: "pointer",
  });

  return (
    <article>
      <Breadcrumb section="入门" page="接入 Claude Code" />
      <H1 id="top">接入 Claude Code</H1>
      <Lead>
        从下面两个方式中选一个即可，不需要都执行。方式 A 一条命令装好 Claude Code 并自动写入环境变量；
        方式 B 适合本地已经有 Claude Code、只想换中转的情况。
      </Lead>

      <div style={{ display: "flex", gap: 8, margin: "16px 0 24px" }}>
        <button type="button" onClick={() => setOs("linux")} style={tabStyle(os === "linux")}>Linux</button>
        <button type="button" onClick={() => setOs("mac")} style={tabStyle(os === "mac")}>macOS</button>
        <button type="button" onClick={() => setOs("win")} style={tabStyle(os === "win")}>Windows</button>
      </div>

      <H2 id="install">方式 A · 自动安装（推荐）</H2>
      <P>
        一条命令 —— 安装 Claude Code 并自动配置环境变量。脚本会写入当前 shell 的 rc 文件
        （<IC>~/.bashrc</IC> / <IC>~/.zshrc</IC> / PowerShell profile），后续新开终端直接可用。
      </P>
      <Code language={os === "win" ? "POWERSHELL" : "BASH"}>{INSTALL_CMDS[os]}</Code>
      <P>
        脚本执行完后，在新终端里直接敲 <IC>claude</IC> 就能启动。首次启动有两个提示，都要选对：
      </P>
      <Callout tone="warn" title="首次启动的两个选择">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div>
            <IC>Do you trust the files in this folder?</IC> → 选 <b>YES</b>
          </div>
          <div>
            <IC>Detected a custom API key... Do you want to use this API key?</IC> → 选 <b>1. Yes</b>
            <span style={{ color: "var(--text-3)" }}>（默认是 No，不选会导致使用失败）</span>
          </div>
        </div>
      </Callout>

      <H2 id="manual">方式 B · 手动配置</H2>
      <P>
        已经装过 Claude Code（或者你自己管理 PATH），只需要导出两个环境变量：
      </P>
      <Code language={os === "win" ? "POWERSHELL" : "BASH"}>{ENV_EXPORT[os]}</Code>
      <P>
        把 <IC>sk-relay-your-key</IC> 替换成
        <a href="/dashboard/keys" style={{ color: "var(--clay-press)" }}> 控制台 → API 密钥 </a>
        里创建的那把。
      </P>
      <Callout tone="clay" title="首次运行 claude 同样有两个提示">
        和方式 A 一样，记得 <IC>Do you trust the files...</IC> 选 YES，
        <IC>Detected a custom API key...</IC> 选 <b>1. Yes</b>（默认 No，跳过会直接报错）。
      </Callout>

      <H2 id="verify">验证接入成功</H2>
      <P>
        在任意项目目录下运行：
      </P>
      <Code language="BASH">{`cd your-project
claude "帮我总结这个仓库干了什么"`}</Code>
      <P>
        第一次回答出现时，打开
        <a href="/dashboard/logs" style={{ color: "var(--clay-press)" }}> 控制台 → 请求日志</a>，
        就能看到新记录，<IC>audit_match</IC> 为绿色对勾 —— 证明我们把你发的请求一字不改地转到了 Anthropic。
      </P>

      <H2 id="troubleshoot">常见问题</H2>
      <P>
        <b>claude 命令找不到</b> —— 重新打开一个终端，让新 rc 生效；或者手动
        <IC>source ~/.bashrc</IC> / <IC>source ~/.zshrc</IC>。Windows 用户需要重开 PowerShell。
      </P>
      <P>
        <b>401 unauthorized</b> —— 检查 <IC>ANTHROPIC_API_KEY</IC> 是否是 <IC>sk-relay-</IC> 开头的那把，
        而不是 Anthropic 原生的 <IC>sk-ant-*</IC>。我们不接受 sk-ant 直连。
      </P>
      <P>
        <b>提示里选了 No 怎么办</b> —— 退出 claude，删掉
        <IC>~/.config/claude/config.json</IC>（Windows 是 <IC>%APPDATA%\\claude\\config.json</IC>），
        再次启动重新选。
      </P>
    </article>
  );
}
