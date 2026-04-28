import { Hono } from 'hono'

const BASH_SCRIPT = (baseUrl: string) => `#!/usr/bin/env bash
# Claude Code installer for 同源 (Tongyuan) relay.
#
# What this does, in order:
#   1) If \`claude\` is already on PATH        → skip install.
#   2) Else, if node+npm missing              → install Node 20 via nvm.
#   3) Else, install @anthropic-ai/claude-code via npm.
#   4) Prompt about existing ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY.
#   5) Write chosen values to your shell rc.
set -euo pipefail

RELAY_BASE_URL="${baseUrl}"
log()  { printf "\\e[36m[install]\\e[0m %s\\n" "\$*"; }
warn() { printf "\\e[33m[install]\\e[0m %s\\n" "\$*" >&2; }
ask()  { printf "\\e[35m[install]\\e[0m %s " "\$*"; }

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

# ---- 4. Handle ANTHROPIC_BASE_URL ----
WRITE_BASE_URL=1
EXISTING_BASE_URL="\${ANTHROPIC_BASE_URL:-}"
if [ -z "\$EXISTING_BASE_URL" ]; then
  # also check rc file
  EXISTING_BASE_URL="\$(grep -E "^\\s*(export )?ANTHROPIC_BASE_URL=" "\$RC" 2>/dev/null | tail -1 | sed "s/.*=//;s/[\\\"']//g" || true)"
fi
if [ -n "\$EXISTING_BASE_URL" ] && [ "\$EXISTING_BASE_URL" != "\$RELAY_BASE_URL" ]; then
  ask "已检测到 ANTHROPIC_BASE_URL=\$EXISTING_BASE_URL，是否替换为 \$RELAY_BASE_URL？[Y/n]"
  read -r _ans </dev/tty
  case "\${_ans:-Y}" in
    [Nn]*) WRITE_BASE_URL=0; log "保留原有 ANTHROPIC_BASE_URL。" ;;
    *)     WRITE_BASE_URL=1 ;;
  esac
fi

if [ "\$WRITE_BASE_URL" = "1" ]; then
  TMPRC="\$(mktemp)"
  grep -v "^\\s*export ANTHROPIC_BASE_URL=" "\$RC" 2>/dev/null \\
    | grep -v "^\\s*set -gx ANTHROPIC_BASE_URL " > "\$TMPRC" || true
  if [ "\$SHELL_NAME" = "fish" ]; then
    echo "set -gx ANTHROPIC_BASE_URL \\"\$RELAY_BASE_URL\\"" >> "\$TMPRC"
  else
    echo "export ANTHROPIC_BASE_URL=\\"\$RELAY_BASE_URL\\"" >> "\$TMPRC"
  fi
  mv "\$TMPRC" "\$RC"
  log "ANTHROPIC_BASE_URL=\$RELAY_BASE_URL  （已写入 \$RC）"
fi

# ---- 5. Handle ANTHROPIC_API_KEY ----
WRITE_API_KEY=1
EXISTING_API_KEY="\${ANTHROPIC_API_KEY:-}"
if [ -z "\$EXISTING_API_KEY" ]; then
  EXISTING_API_KEY="\$(grep -E "^\\s*(export )?ANTHROPIC_API_KEY=" "\$RC" 2>/dev/null | tail -1 | sed "s/.*=//;s/[\\\"']//g" || true)"
fi
if [ -n "\$EXISTING_API_KEY" ]; then
  MASKED="\${EXISTING_API_KEY:0:12}…"
  ask "已检测到 ANTHROPIC_API_KEY=\$MASKED，是否替换？[y/N]"
  read -r _ans </dev/tty
  case "\${_ans:-N}" in
    [Yy]*) WRITE_API_KEY=1 ;;
    *)     WRITE_API_KEY=0; log "保留原有 ANTHROPIC_API_KEY。" ;;
  esac
fi

if [ "\$WRITE_API_KEY" = "1" ]; then
  echo ""
  log "请前往控制台 → API 密钥 → 新建一把 sk-relay-* 密钥。"
  ask "请输入你的 API 密钥（sk-relay-...）："
  read -r NEW_API_KEY </dev/tty
  if [ -z "\$NEW_API_KEY" ]; then
    warn "未输入 API 密钥，跳过写入。你可以之后手动添加到 \$RC：export ANTHROPIC_API_KEY=<密钥>"
  else
    TMPRC="\$(mktemp)"
    grep -v "^\\s*export ANTHROPIC_API_KEY=" "\$RC" 2>/dev/null \\
      | grep -v "^\\s*set -gx ANTHROPIC_API_KEY " > "\$TMPRC" || true
    if [ "\$SHELL_NAME" = "fish" ]; then
      echo "set -gx ANTHROPIC_API_KEY \\"\$NEW_API_KEY\\"" >> "\$TMPRC"
    else
      echo "export ANTHROPIC_API_KEY=\\"\$NEW_API_KEY\\"" >> "\$TMPRC"
    fi
    mv "\$TMPRC" "\$RC"
    log "ANTHROPIC_API_KEY 已写入 \$RC"
  fi
fi

echo ""
log "✓ 完成"
[ "\$SKIP_INSTALL" = "1" ] && log "Claude Code 已经装好，跳过了安装步骤。"
echo ""
echo "新开一个终端，然后运行："
echo "  claude"
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
# 4) Prompt about existing ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY.
# 5) Persist chosen values as User env vars.
\$ErrorActionPreference = "Stop"

\$RelayBaseUrl = "${baseUrl}"

function Log([string]\$msg)  { Write-Host "[install] \$msg" -ForegroundColor Cyan }
function Warn([string]\$msg) { Write-Host "[install] \$msg" -ForegroundColor Yellow }
function Ask([string]\$msg)  { Write-Host "[install] \$msg " -ForegroundColor Magenta -NoNewline }

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

# ---- 3. Handle ANTHROPIC_BASE_URL ----
\$WriteBaseUrl = \$true
\$ExistingBaseUrl = [Environment]::GetEnvironmentVariable("ANTHROPIC_BASE_URL", "User")
if (-not \$ExistingBaseUrl) { \$ExistingBaseUrl = \$env:ANTHROPIC_BASE_URL }
if (\$ExistingBaseUrl -and \$ExistingBaseUrl -ne \$RelayBaseUrl) {
  Ask "已检测到 ANTHROPIC_BASE_URL=\$ExistingBaseUrl，是否替换为 \$RelayBaseUrl？[Y/n]"
  \$ans = Read-Host
  if (\$ans -match '^[Nn]') { \$WriteBaseUrl = \$false; Log "保留原有 ANTHROPIC_BASE_URL。" }
}
if (\$WriteBaseUrl) {
  [Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", \$RelayBaseUrl, "User")
  \$env:ANTHROPIC_BASE_URL = \$RelayBaseUrl
  Log "ANTHROPIC_BASE_URL=\$RelayBaseUrl  （已写入 user env）"
}

# ---- 4. Handle ANTHROPIC_API_KEY ----
\$WriteApiKey = \$true
\$ExistingApiKey = [Environment]::GetEnvironmentVariable("ANTHROPIC_API_KEY", "User")
if (-not \$ExistingApiKey) { \$ExistingApiKey = \$env:ANTHROPIC_API_KEY }
if (\$ExistingApiKey) {
  \$Masked = \$ExistingApiKey.Substring(0, [Math]::Min(12, \$ExistingApiKey.Length)) + "…"
  Ask "已检测到 ANTHROPIC_API_KEY=\$Masked，是否替换？[y/N]"
  \$ans = Read-Host
  if (\$ans -notmatch '^[Yy]') { \$WriteApiKey = \$false; Log "保留原有 ANTHROPIC_API_KEY。" }
}
if (\$WriteApiKey) {
  Write-Host ""
  Log "请前往控制台 → API 密钥 → 新建一把 sk-relay-* 密钥。"
  Ask "请输入你的 API 密钥（sk-relay-...）："
  \$NewApiKey = Read-Host
  if (-not \$NewApiKey) {
    Warn "未输入 API 密钥，跳过写入。你可以之后手动设置："
    Warn "  [Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', '<密钥>', 'User')"
  } else {
    [Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", \$NewApiKey, "User")
    \$env:ANTHROPIC_API_KEY = \$NewApiKey
    Log "ANTHROPIC_API_KEY 已写入 user env"
  }
}

Write-Host ""
Log "✓ 完成"
if (\$SkipInstall) { Log "Claude Code 已经装好，跳过了安装步骤。" }
Write-Host ""
Write-Host "重开一个 PowerShell 窗口，然后运行："
Write-Host "  claude"
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
