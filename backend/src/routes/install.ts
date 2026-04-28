import { Hono } from 'hono'

const BASH_SCRIPT = (baseUrl: string) => `#!/usr/bin/env bash
# Claude Code installer for 同源 (Tongyuan) relay.
#
# What this does, in order:
#   1) If \`claude\` is already on PATH        → skip install.
#   2) Else, if node+npm missing              → install Node 20 via nvm.
#   3) Else, install @anthropic-ai/claude-code via npm.
#   4) Write ANTHROPIC_BASE_URL to your shell rc (idempotent).
#
# ANTHROPIC_API_KEY is left for you to set — it's a per-user sk-relay-*
# secret that only you can generate from the console.
set -euo pipefail

RELAY_BASE_URL="${baseUrl}"
log() { printf "\\e[36m[install]\\e[0m %s\\n" "\$*"; }
warn() { printf "\\e[33m[install]\\e[0m %s\\n" "\$*" >&2; }

# ---- 1. Detect existing install ----
if command -v claude >/dev/null 2>&1; then
  log "已检测到 claude: \$(command -v claude)"
  SKIP_INSTALL=1
else
  SKIP_INSTALL=0
fi

# ---- 2. Ensure node+npm (only if we need to install) ----
if [ "\$SKIP_INSTALL" = "0" ]; then
  if ! command -v npm >/dev/null 2>&1; then
    log "未检测到 npm，尝试用 nvm 装 Node 20…"
    export NVM_DIR="\$HOME/.nvm"
    if [ ! -s "\$NVM_DIR/nvm.sh" ]; then
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    fi
    # shellcheck disable=SC1090
    . "\$NVM_DIR/nvm.sh"
    nvm install 20
    nvm use 20
  fi

  if ! command -v npm >/dev/null 2>&1; then
    warn "npm 依然不可用。请手动装 Node.js 20+（https://nodejs.org）后重跑本脚本。"
    exit 1
  fi

  log "正在安装 @anthropic-ai/claude-code（npm -g）…"
  npm install -g @anthropic-ai/claude-code
fi

# ---- 3. Detect rc file ----
SHELL_NAME="\$(basename "\${SHELL:-/bin/bash}")"
case "\$SHELL_NAME" in
  zsh)  RC="\$HOME/.zshrc" ;;
  bash) RC="\$HOME/.bashrc" ;;
  fish) RC="\$HOME/.config/fish/config.fish" ;;
  *)    RC="\$HOME/.profile" ;;
esac
mkdir -p "\$(dirname "\$RC")"
touch "\$RC"

# ---- 4. Write ANTHROPIC_BASE_URL (replace any existing line) ----
TMPRC="\$(mktemp)"
grep -v "^\\s*export ANTHROPIC_BASE_URL=" "\$RC" 2>/dev/null \\
  | grep -v "^\\s*set -gx ANTHROPIC_BASE_URL " > "\$TMPRC" || true

if [ "\$SHELL_NAME" = "fish" ]; then
  echo "set -gx ANTHROPIC_BASE_URL \\"\$RELAY_BASE_URL\\"" >> "\$TMPRC"
else
  echo "export ANTHROPIC_BASE_URL=\\"\$RELAY_BASE_URL\\"" >> "\$TMPRC"
fi
mv "\$TMPRC" "\$RC"

echo ""
log "✓ 完成"
log "ANTHROPIC_BASE_URL=\$RELAY_BASE_URL  （已写入 \$RC）"
[ "\$SKIP_INSTALL" = "1" ] && log "Claude Code 已经装好，跳过了安装步骤。"
echo ""
echo "下一步："
echo "  1) 登录控制台 → API 密钥 → 新建一把 sk-relay-*"
echo "  2) 把它加到 \$RC:  export ANTHROPIC_API_KEY=<粘贴>"
echo "  3) 新开终端，跑  claude"
echo ""
echo "首次 claude 启动的两个提示一定要选对："
echo "  · 'Do you trust the files in this folder?'       → YES"
echo "  · 'Detected a custom API key... use this?'        → 1. Yes（默认 No）"
`

const POWERSHELL_SCRIPT = (baseUrl: string) => `# Claude Code installer for 同源 (Tongyuan) relay — Windows PowerShell.
#
# 1) If \`claude\` already on PATH            → skip install.
# 2) Else, if node missing                   → install via winget (Node 20 LTS).
# 3) Else, install @anthropic-ai/claude-code via npm.
# 4) Persist ANTHROPIC_BASE_URL as a User env var (idempotent).
\$ErrorActionPreference = "Stop"

\$RelayBaseUrl = "${baseUrl}"

function Log([string]\$msg)  { Write-Host "[install] \$msg" -ForegroundColor Cyan }
function Warn([string]\$msg) { Write-Host "[install] \$msg" -ForegroundColor Yellow }

# ---- 1. Detect existing install ----
\$claudeOnPath = Get-Command claude -ErrorAction SilentlyContinue
if (\$claudeOnPath) {
  Log "已检测到 claude: \$(\$claudeOnPath.Source)"
  \$SkipInstall = \$true
} else {
  \$SkipInstall = \$false
}

if (-not \$SkipInstall) {
  # ---- 2. Ensure Node.js ----
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
      Log "未检测到 node，用 winget 安装 Node.js 20 LTS…"
      winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
      \$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    } else {
      Warn "winget 不可用。请手动装 Node.js 20+ 后重跑：https://nodejs.org"
      exit 1
    }
  }

  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Warn "npm 依然不可用，请重开 PowerShell 后再试。"
    exit 1
  }

  Log "正在安装 @anthropic-ai/claude-code（npm -g）…"
  npm install -g '@anthropic-ai/claude-code'
}

# ---- 3. Persist ANTHROPIC_BASE_URL (user-scoped, survives restarts) ----
[Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", \$RelayBaseUrl, "User")
\$env:ANTHROPIC_BASE_URL = \$RelayBaseUrl

Write-Host ""
Log "✓ 完成"
Log "ANTHROPIC_BASE_URL=\$RelayBaseUrl  （已写入 user env）"
if (\$SkipInstall) { Log "Claude Code 已经装好，跳过了安装步骤。" }
Write-Host ""
Write-Host "下一步："
Write-Host "  1) 登录控制台 → API 密钥 → 新建一把 sk-relay-*"
Write-Host "  2) [Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', '<粘贴>', 'User')"
Write-Host "  3) 重开 PowerShell，跑  claude"
Write-Host ""
Write-Host "首次 claude 启动的两个提示一定要选对："
Write-Host "  · 'Do you trust the files in this folder?'       → YES"
Write-Host "  · 'Detected a custom API key... use this?'        → 1. Yes（默认 No）"
`

// Resolve the base URL the client should send requests to. Prefer the
// forwarded host (nginx / Vite proxy) so the script points back at the
// domain the user actually hit; fall back to Host header.
function resolveBaseUrl(c: any): string {
  const proto = c.req.header('x-forwarded-proto') ?? (c.req.url.startsWith('https') ? 'https' : 'http')
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? 'localhost:8080'
  return `${proto}://${host}`
}

export const installRoutes = new Hono()

installRoutes.get('/install', (c) => {
  const body = BASH_SCRIPT(resolveBaseUrl(c))
  return c.body(body, 200, {
    'content-type': 'text/x-shellscript; charset=utf-8',
    'cache-control': 'no-store',
  })
})

installRoutes.get('/install.ps1', (c) => {
  const body = POWERSHELL_SCRIPT(resolveBaseUrl(c))
  return c.body(body, 200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  })
})
