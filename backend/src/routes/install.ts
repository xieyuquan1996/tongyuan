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

const OPENCLAW_SCRIPT = (baseUrl: string) => `#!/usr/bin/env bash
# OpenClaw connector for 同源 (Tongyuan) relay.
#
# What this does, in order:
#   1) If \`openclaw\` is missing         → install it globally via npm (@latest).
#   2) Prompt for your sk-relay-* key.
#   3) Merge a custom provider into ~/.openclaw/openclaw.json (idempotent,
#      timestamped backup, atomic write — other fields left untouched).
#   4) Run \`openclaw gateway restart\` so the change takes effect immediately.
set -euo pipefail

RELAY_BASE_URL="${baseUrl}"
MODEL_ID="\${OPENCLAW_MODEL:-claude-sonnet-4-6}"
CFG="\${OPENCLAW_CONFIG:-\$HOME/.openclaw/openclaw.json}"

# Models we proxy through the relay (see 控制台 → 模型 for live status/pricing).
AVAILABLE_MODELS="claude-opus-4-7
claude-opus-4-6
claude-opus-4-5
claude-opus-4-1
claude-opus-4
claude-sonnet-4-6
claude-sonnet-4-5
claude-sonnet-4
claude-3-7-sonnet
claude-haiku-4-5
claude-3-5-haiku"

log()  { printf "\\e[36m[openclaw]\\e[0m %s\\n" "\$*"; }
warn() { printf "\\e[33m[openclaw]\\e[0m %s\\n" "\$*" >&2; }
ask()  { printf "\\e[35m[openclaw]\\e[0m %s " "\$*"; }

# ---- 1. Ensure openclaw + python3 ----
if ! command -v python3 >/dev/null 2>&1; then
  warn "需要 python3 来合并 JSON 配置。请先装 python3 后重跑本脚本。"
  exit 1
fi

FRESH_INSTALL=0
if command -v openclaw >/dev/null 2>&1; then
  log "已检测到 openclaw: \$(command -v openclaw)，跳过安装。"
else
  FRESH_INSTALL=1
  log "未检测到 openclaw，准备安装…"
  NEED_NODE=0
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    NEED_NODE=1
  else
    # openclaw requires Node 24 (recommended) or 22.14+
    NODE_VER="\$(node -v | sed 's/^v//')"
    NODE_MAJOR="\${NODE_VER%%.*}"
    NODE_REST="\${NODE_VER#*.}"
    NODE_MINOR="\${NODE_REST%%.*}"
    if [ "\$NODE_MAJOR" -lt 22 ] || { [ "\$NODE_MAJOR" = "22" ] && [ "\$NODE_MINOR" -lt 14 ]; }; then
      warn "检测到 Node \$NODE_VER，OpenClaw 需要 Node 24（推荐）或 22.14+。将用 nvm 装一份 Node 24…"
      NEED_NODE=1
    fi
  fi

  if [ "\$NEED_NODE" = "1" ]; then
    export NVM_DIR="\$HOME/.nvm"
    if [ ! -s "\$NVM_DIR/nvm.sh" ]; then
      log "安装 nvm…"
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    fi
    # shellcheck disable=SC1090
    . "\$NVM_DIR/nvm.sh"
    log "nvm install 24 …"
    nvm install 24
    nvm use 24
  fi

  if ! command -v npm >/dev/null 2>&1; then
    warn "npm 依然不可用。请手动装 Node.js 24（或 22.14+）后重跑本脚本。"
    exit 1
  fi
  log "正在安装 openclaw（npm i -g openclaw@latest）…"
  npm install -g openclaw@latest
fi

# ---- 2. First-run check: openclaw must be initialized before we touch config ----
# \`openclaw onboard --install-daemon\` is interactive (it asks for provider /
# model / auth and then registers the launchd/systemd service). We don't try
# to replace that — we just stop and tell the user how to proceed.
if [ "\$FRESH_INSTALL" = "1" ] || [ ! -f "\$CFG" ]; then
  echo ""
  log "检测到 openclaw 尚未初始化（未找到 \$CFG）。"
  log "请先跑一次官方向导完成初始化（安装 gateway daemon、生成 auth token）："
  echo ""
  echo "    openclaw onboard --install-daemon"
  echo ""
  log "向导里选择："
  log "  · Model/auth provider     → Custom Provider"
  log "  · API Base URL            → \$RELAY_BASE_URL"
  log "  · Endpoint compatibility  → Anthropic-compatible"
  log "  · API Key                 → 控制台 → API 密钥 → 新建一把 sk-relay-* 粘进去"
  log "  · Model ID                → \$MODEL_ID（默认最新 Sonnet）"
  echo ""
  log "可选的模型 ID（最新 → 旧）："
  echo "\$AVAILABLE_MODELS" | sed 's/^/    · /'
  echo ""
  log "向导跑完后，openclaw 就已经能用了。如需以后重复写入/更新配置，再跑一次本脚本即可。"
  exit 0
fi

# ---- 3. Prompt for API key ----
API_KEY="\${OPENCLAW_LINK_API_KEY:-}"
if [ -z "\$API_KEY" ]; then
  log "请前往控制台 → API 密钥 → 新建一把 sk-relay-* 密钥。"
  ask "请输入你的 API 密钥（sk-relay-...）："
  read -r API_KEY </dev/tty
fi
if [ -z "\$API_KEY" ]; then
  warn "未输入 API 密钥。退出。"
  exit 1
fi

# ---- 4. Merge config atomically via python3 ----
mkdir -p "\$(dirname "\$CFG")"
log "合并写入 \$CFG …"

OPENCLAW_BASE_URL="\$RELAY_BASE_URL" \\
OPENCLAW_API_KEY="\$API_KEY" \\
OPENCLAW_MODEL_ID="\$MODEL_ID" \\
OPENCLAW_CFG="\$CFG" \\
python3 - <<'PYEOF'
import json, os, re, shutil, sys, tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

base_url = os.environ["OPENCLAW_BASE_URL"]
api_key  = os.environ["OPENCLAW_API_KEY"]
model_id = os.environ["OPENCLAW_MODEL_ID"]
cfg_path = Path(os.environ["OPENCLAW_CFG"])

host = urlparse(base_url).hostname or ""
if not host:
    print(f"bad base_url: {base_url!r}", file=sys.stderr); sys.exit(1)
provider_id = "custom-" + re.sub(r"[^a-z0-9]+", "-", host.lower()).strip("-")

cfg = {}
if cfg_path.exists():
    try:
        cfg = json.loads(cfg_path.read_text("utf-8"))
    except json.JSONDecodeError as e:
        print(f"{cfg_path} is not valid JSON: {e}", file=sys.stderr); sys.exit(1)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = cfg_path.with_suffix(cfg_path.suffix + f".bak.{stamp}")
    shutil.copy2(cfg_path, backup)
    print(f"   backup: {backup}")

providers = cfg.setdefault("models", {}).setdefault("providers", {})
cfg["models"].setdefault("mode", "merge")
existing = providers.get(provider_id) or {}
existing["baseUrl"] = base_url
existing["api"]     = "anthropic-messages"
existing["apiKey"]  = api_key
models = [m for m in (existing.get("models") or []) if isinstance(m, dict) and m.get("id") != model_id]
models.append({
    "id": model_id,
    "name": f"{model_id} (Custom Provider)",
    "contextWindow": 200000,
    "maxTokens": 8192,
    "input": ["text"],
    "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
    "reasoning": False,
})
existing["models"] = models
providers[provider_id] = existing

ref = f"{provider_id}/{model_id}"
allow = cfg.setdefault("agents", {}).setdefault("defaults", {}).setdefault("models", {})
allow.setdefault(ref, {})
cfg["agents"]["defaults"].setdefault("model", {})["primary"] = ref

cfg_path.parent.mkdir(parents=True, exist_ok=True)
fd, tmp = tempfile.mkstemp(prefix=".openclaw-", suffix=".json", dir=str(cfg_path.parent))
try:
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
        f.write("\\n")
    os.replace(tmp, cfg_path)
except Exception:
    os.unlink(tmp); raise
print(f"   provider: {provider_id}")
print(f"   primary:  {ref}")
PYEOF

# ---- 5. Restart gateway ----
log "openclaw gateway restart"
if ! openclaw gateway restart; then
  warn "重启失败。配置已写入，手动再跑一次 'openclaw gateway restart' 即可。"
  exit 1
fi

echo ""
log "✓ 完成。接入同源的 OpenClaw 已经就绪。"
log "可以用 /model 在会话里切换，也可以跑 'openclaw agent --message \\"hi\\"' 快速验证。"
`

const HERMES_SCRIPT = (baseUrl: string) => `#!/usr/bin/env bash
# Hermes Agent connector for 同源 (Tongyuan) relay.
#
# Hermes honors the standard ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY env vars,
# so configuring it is just "write two exports into your shell rc" — same
# pattern as Claude Code.
#
# We deliberately do NOT run Hermes' official installer from here: its
# install.sh auto-launches the interactive TUI on success, which would hijack
# the terminal and prevent the rest of this script from running. If you
# don't have hermes yet, install it first (see the prompt at the end), then
# re-run this script.
set -euo pipefail

RELAY_BASE_URL="${baseUrl}"
# Hermes reads ANTHROPIC_MODEL at launch; default to the latest Sonnet.
HERMES_MODEL="\${HERMES_MODEL:-claude-sonnet-4-6}"

# Models served via this relay (see 控制台 → 模型 for live availability/pricing).
AVAILABLE_MODELS="claude-opus-4-7
claude-opus-4-6
claude-opus-4-5
claude-opus-4-1
claude-opus-4
claude-sonnet-4-6
claude-sonnet-4-5
claude-sonnet-4
claude-3-7-sonnet
claude-haiku-4-5
claude-3-5-haiku"

log()  { printf "\\e[36m[hermes]\\e[0m %s\\n" "\$*"; }
warn() { printf "\\e[33m[hermes]\\e[0m %s\\n" "\$*" >&2; }
ask()  { printf "\\e[35m[hermes]\\e[0m %s " "\$*"; }

# ---- 1. Detect hermes (optional — we can still write the env for later) ----
if command -v hermes >/dev/null 2>&1; then
  log "已检测到 hermes: \$(command -v hermes)"
  HERMES_PRESENT=1
else
  HERMES_PRESENT=0
fi

# ---- 2. Detect rc file ----
SHELL_NAME="\$(basename "\${SHELL:-/bin/bash}")"
case "\$SHELL_NAME" in
  zsh)  RC="\$HOME/.zshrc";             RC_SHORT="~/.zshrc" ;;
  bash) RC="\$HOME/.bashrc";            RC_SHORT="~/.bashrc" ;;
  fish) RC="\$HOME/.config/fish/config.fish"; RC_SHORT="~/.config/fish/config.fish" ;;
  *)    RC="\$HOME/.profile";           RC_SHORT="~/.profile" ;;
esac
mkdir -p "\$(dirname "\$RC")"
touch "\$RC"

# ---- 3. Write ANTHROPIC_BASE_URL ----
WRITE_BASE_URL=1
EXISTING_BASE_URL="\${ANTHROPIC_BASE_URL:-}"
if [ -z "\$EXISTING_BASE_URL" ]; then
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
  log "ANTHROPIC_BASE_URL=\$RELAY_BASE_URL  （已写入 \$RC_SHORT）"
fi

# ---- 4. Write ANTHROPIC_API_KEY ----
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
  NEW_API_KEY="\${HERMES_LINK_API_KEY:-}"
  if [ -z "\$NEW_API_KEY" ]; then
    echo ""
    log "请前往控制台 → API 密钥 → 新建一把 sk-relay-* 密钥。"
    ask "请输入你的 API 密钥（sk-relay-...）："
    read -r NEW_API_KEY </dev/tty
  fi
  if [ -z "\$NEW_API_KEY" ]; then
    warn "未输入 API 密钥，跳过写入。你可以之后手动添加到 \$RC_SHORT：export ANTHROPIC_API_KEY=<密钥>"
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
    log "ANTHROPIC_API_KEY 已写入 \$RC_SHORT"
  fi
fi

echo ""
log "✓ 环境变量已写入 \$RC_SHORT。"
warn "⚠  rc 的改动只对\\e[1m新\\e[0m\\e[33m终端生效 —— 本会话仍是旧值。\\e[0m"
warn "    要么 \\e[1msource \$RC_SHORT\\e[0m，要么把下面两行粘进当前 shell：\\e[0m"
echo ""
echo "    export ANTHROPIC_BASE_URL=\\"\$RELAY_BASE_URL\\""
if [ -n "\${NEW_API_KEY:-}" ]; then
  echo "    export ANTHROPIC_API_KEY=\\"\$NEW_API_KEY\\""
else
  echo "    export ANTHROPIC_API_KEY=\\"<你的 sk-relay-* 密钥>\\""
fi
echo "    export ANTHROPIC_MODEL=\\"\$HERMES_MODEL\\"    # 默认最新 Sonnet"
echo ""
log "可选的模型 ID（最新 → 旧）："
echo "\$AVAILABLE_MODELS" | sed 's/^/    · /'
echo ""
if [ "\$HERMES_PRESENT" = "0" ]; then
  log "还没装 hermes。在本 shell 生效 env 后，再跑："
  echo ""
  echo "    curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash"
  echo ""
  log "官方安装脚本收尾会自动进 TUI；按 Ctrl+C 退出即可。之后 'hermes' 启动就会走同源。"
else
  log "本 shell 生效 env 后，'hermes' 就会走同源；或者新开一个终端（\$RC_SHORT 会自动被加载）也行。"
fi
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

installRoutes.get('/install/openclaw', (c) => {
  const body = OPENCLAW_SCRIPT(resolveBaseUrl(c))
  return c.body(body, 200, {
    'content-type': 'text/x-shellscript; charset=utf-8',
    'cache-control': 'no-store',
  })
})

installRoutes.get('/install/hermes', (c) => {
  const body = HERMES_SCRIPT(resolveBaseUrl(c))
  return c.body(body, 200, {
    'content-type': 'text/x-shellscript; charset=utf-8',
    'cache-control': 'no-store',
  })
})
