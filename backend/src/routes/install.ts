import { Hono } from 'hono'

const BASH_SCRIPT = (baseUrl: string) => `#!/usr/bin/env bash
# Claude Code installer — pipes in Claude Code via npm, then writes
# ANTHROPIC_BASE_URL to your shell rc so new terminals pick it up.
# You still need to set ANTHROPIC_API_KEY yourself (it's user-specific).
set -euo pipefail

RELAY_BASE_URL="${baseUrl}"
NEED_NODE=0

if ! command -v node >/dev/null 2>&1; then
  NEED_NODE=1
fi

if ! command -v npm >/dev/null 2>&1; then
  NEED_NODE=1
fi

if [ "\$NEED_NODE" = "1" ]; then
  echo "\\n[install] node / npm 未安装。请先装 Node.js 20+：https://nodejs.org" >&2
  echo "[install] 装好后重跑本脚本。" >&2
  exit 1
fi

echo "[install] installing @anthropic-ai/claude-code (via npm -g)…"
npm install -g @anthropic-ai/claude-code

# Detect rc file. Prefer the one matching \$SHELL; fallback to .profile.
SHELL_NAME="\$(basename "\${SHELL:-/bin/bash}")"
case "\$SHELL_NAME" in
  zsh)   RC="\$HOME/.zshrc" ;;
  bash)  RC="\$HOME/.bashrc" ;;
  fish)  RC="\$HOME/.config/fish/config.fish" ;;
  *)     RC="\$HOME/.profile" ;;
esac

# Idempotent append — replace any existing ANTHROPIC_BASE_URL line.
TMPRC="\$(mktemp)"
if [ -f "\$RC" ]; then
  grep -v "ANTHROPIC_BASE_URL=" "\$RC" > "\$TMPRC" || true
else
  : > "\$TMPRC"
fi

if [ "\$SHELL_NAME" = "fish" ]; then
  echo "set -gx ANTHROPIC_BASE_URL \\"\$RELAY_BASE_URL\\"" >> "\$TMPRC"
else
  echo "export ANTHROPIC_BASE_URL=\\"\$RELAY_BASE_URL\\"" >> "\$TMPRC"
fi

mkdir -p "\$(dirname "\$RC")"
mv "\$TMPRC" "\$RC"

echo ""
echo "[install] ✓ done"
echo "[install] ANTHROPIC_BASE_URL=\$RELAY_BASE_URL  (written to \$RC)"
echo ""
echo "下一步："
echo "  1) 登录控制台 → API 密钥 → 新建一把 sk-relay-*"
echo "  2) export ANTHROPIC_API_KEY=<粘贴刚才的 sk-relay-*>"
echo "     或者直接加一行到 \$RC"
echo "  3) 新开终端，跑  claude  "
echo ""
echo "首次 claude 启动的两个提示一定要选对："
echo "  - 'Do you trust the files in this folder?' → YES"
echo "  - 'Detected a custom API key...' → 1. Yes  (默认 No)"
`

const POWERSHELL_SCRIPT = (baseUrl: string) => `# Claude Code installer (Windows PowerShell).
# Installs Claude Code via npm and persists ANTHROPIC_BASE_URL for the user.
# You still need to set ANTHROPIC_API_KEY yourself.
\$ErrorActionPreference = "Stop"

\$RelayBaseUrl = "${baseUrl}"

function Require-Command(\$name) {
  if (-not (Get-Command \$name -ErrorAction SilentlyContinue)) {
    Write-Host "[install] \$name 未安装。请先装 Node.js 20+: https://nodejs.org" -ForegroundColor Red
    exit 1
  }
}

Require-Command node
Require-Command npm

Write-Host "[install] installing @anthropic-ai/claude-code (via npm -g)..." -ForegroundColor Cyan
npm install -g '@anthropic-ai/claude-code'

# Persist to user-scoped env so new shells see it.
[Environment]::SetEnvironmentVariable("ANTHROPIC_BASE_URL", \$RelayBaseUrl, "User")

# Also set for the current session so smoke check works.
\$env:ANTHROPIC_BASE_URL = \$RelayBaseUrl

Write-Host ""
Write-Host "[install] ✓ done" -ForegroundColor Green
Write-Host "[install] ANTHROPIC_BASE_URL=\$RelayBaseUrl  (user-scoped env)"
Write-Host ""
Write-Host "下一步："
Write-Host "  1) 登录控制台 → API 密钥 → 新建一把 sk-relay-*"
Write-Host "  2) [Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', '<粘贴 sk-relay-*>', 'User')"
Write-Host "  3) 重开 PowerShell，跑  claude"
Write-Host ""
Write-Host "首次 claude 启动的两个提示一定要选对："
Write-Host "  - 'Do you trust the files in this folder?' → YES"
Write-Host "  - 'Detected a custom API key...' → 1. Yes  (默认 No)"
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
