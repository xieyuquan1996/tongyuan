import { describe, it, expect } from 'vitest'
import { installRoutes } from './install.js'

// Content assertions for the installer script endpoints. We import the Hono
// sub-router directly (instead of createApp) so the tests don't trigger the
// DB/Redis env validation in src/env.ts — they're pure script-content tests.
//
// Endpoints covered:
//   GET /install          — Claude Code (bash)
//   GET /install.ps1      — Claude Code (PowerShell)
//   GET /install/openclaw — OpenClaw wire-up (bash)
//   GET /install/hermes   — Hermes Agent env wire-up (bash)
//
// These tests catch:
//   · route regressions + header mistakes (wrong content-type, missing cache-control)
//   · base-URL substitution bugs (forwarded headers should win)
//   · accidental removal of user-facing safeguards we added after user reports
//     (first-run onboard gate for openclaw, "paste into current shell" for hermes).

async function get(path: string, headers: Record<string, string> = {}) {
  const r = await installRoutes.fetch(new Request(`http://relay.example.com${path}`, { headers }))
  const body = await r.text()
  return { status: r.status, body, headers: r.headers }
}

describe('install routes', () => {
  describe('GET /install (bash)', () => {
    it('serves a bash installer with relay base URL substituted from Host', async () => {
      const r = await get('/install', { host: 'relay.example.com' })
      expect(r.status).toBe(200)
      expect(r.headers.get('content-type') ?? '').toContain('text/x-shellscript')
      expect(r.headers.get('cache-control')).toBe('no-store')
      expect(r.body).toMatch(/^#!\/usr\/bin\/env bash/)
      expect(r.body).toContain('RELAY_BASE_URL="http://relay.example.com"')
    })

    it('honors x-forwarded-proto and x-forwarded-host', async () => {
      const r = await get('/install', {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'claude-link.jinni.life',
      })
      expect(r.status).toBe(200)
      expect(r.body).toContain('RELAY_BASE_URL="https://claude-link.jinni.life"')
      expect(r.body).not.toContain('relay.example.com')
    })
  })

  describe('GET /install.ps1 (PowerShell)', () => {
    it('serves a PowerShell installer with relay base URL substituted', async () => {
      const r = await get('/install.ps1', {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'claude-link.jinni.life',
      })
      expect(r.status).toBe(200)
      expect(r.headers.get('content-type') ?? '').toContain('text/plain')
      expect(r.body).toContain('$RelayBaseUrl = "https://claude-link.jinni.life"')
      expect(r.body).toContain('Get-Command claude')
    })
  })

  describe('GET /install/openclaw', () => {
    it('serves a bash installer with correct headers', async () => {
      const r = await get('/install/openclaw')
      expect(r.status).toBe(200)
      expect(r.headers.get('content-type') ?? '').toContain('text/x-shellscript')
      expect(r.headers.get('cache-control')).toBe('no-store')
      expect(r.body).toMatch(/^#!\/usr\/bin\/env bash/)
    })

    it('substitutes relay base URL from forwarded headers', async () => {
      const r = await get('/install/openclaw', {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'claude-link.jinni.life',
      })
      expect(r.body).toContain('RELAY_BASE_URL="https://claude-link.jinni.life"')
    })

    it('checks Node >= 22.14 before installing openclaw', async () => {
      // Regression guard: openclaw needs Node 24 (recommended) or 22.14+.
      // An earlier version installed Node 20, which fails at runtime.
      const r = await get('/install/openclaw')
      expect(r.body).toMatch(/Node 24/)
      expect(r.body).toMatch(/22\.14\+/)
      expect(r.body).toMatch(/nvm install 24/)
    })

    it('gates config merge on openclaw being initialized first', async () => {
      // Regression guard: "onboard --install-daemon" is interactive (registers
      // the gateway daemon + generates auth token) and must run before we
      // touch the config. If someone removes the FRESH_INSTALL check, users
      // on a clean box will hit "openclaw gateway restart" on an unregistered
      // daemon and get a confusing failure.
      const r = await get('/install/openclaw')
      expect(r.body).toMatch(/openclaw onboard --install-daemon/)
      expect(r.body).toMatch(/First-run check/)
      expect(r.body).toMatch(/FRESH_INSTALL/)
    })

    it('uses the anthropic-messages API mode and ends with a gateway restart', async () => {
      const r = await get('/install/openclaw')
      expect(r.body).toContain('"anthropic-messages"')
      expect(r.body).toMatch(/openclaw gateway restart/)
    })

    it('honors OPENCLAW_LINK_API_KEY / OPENCLAW_MODEL env overrides', async () => {
      // The default model is now picked from the DB (recommended → newest
      // Sonnet → first enabled), so we can't pin a specific id without
      // making the test brittle to seed changes. Assert the shell pattern
      // instead — `${OPENCLAW_MODEL:-<some-claude-id>}` — which is what
      // matters: the env override works.
      const r = await get('/install/openclaw')
      expect(r.body).toContain('${OPENCLAW_LINK_API_KEY:-}')
      expect(r.body).toMatch(/\$\{OPENCLAW_MODEL:-claude-[a-z0-9-]+\}/)
    })
  })

  describe('GET /install/hermes', () => {
    it('serves a bash installer with correct headers', async () => {
      const r = await get('/install/hermes')
      expect(r.status).toBe(200)
      expect(r.headers.get('content-type') ?? '').toContain('text/x-shellscript')
      expect(r.headers.get('cache-control')).toBe('no-store')
      expect(r.body).toMatch(/^#!\/usr\/bin\/env bash/)
    })

    it('uses env-var configuration (not custom_providers YAML)', async () => {
      // Regression guard: an earlier version of this script merged a
      // custom_providers entry into ~/.hermes/config.yaml. Testing confirmed
      // Hermes honors ANTHROPIC_BASE_URL directly, so the YAML approach is
      // both wrong and unnecessary. Keep this test to prevent reintroducing it.
      const r = await get('/install/hermes', {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'claude-link.jinni.life',
      })
      expect(r.body).toContain('ANTHROPIC_BASE_URL')
      expect(r.body).toContain('ANTHROPIC_API_KEY')
      expect(r.body).toContain('RELAY_BASE_URL="https://claude-link.jinni.life"')
      expect(r.body).not.toMatch(/custom_providers/)
      expect(r.body).not.toMatch(/api_mode:\s*anthropic_messages/)
      expect(r.body).not.toMatch(/PyYAML/)
    })

    it('does NOT auto-run the official Hermes installer', async () => {
      // Regression guard: Hermes' scripts/install.sh launches the TUI on
      // success, which hijacks the terminal and prevents any post-install
      // step from running. The script must only print the command for the
      // user to run themselves, never pipe it into bash at the top level.
      const r = await get('/install/hermes')
      const lines = r.body.split('\n')
      for (const line of lines) {
        if (line.includes('hermes-agent/main/scripts/install.sh | bash')) {
          // Must be inside an echo or comment, never executable:
          expect(line).toMatch(/^\s*(#|echo\s)/)
        }
      }
      // But it should appear somewhere (as instructions):
      expect(r.body).toContain('hermes-agent/main/scripts/install.sh')
    })

    it('detects hermes and only recommends the installer when missing', async () => {
      const r = await get('/install/hermes')
      expect(r.body).toMatch(/command -v hermes/)
      expect(r.body).toMatch(/HERMES_PRESENT/)
      // The "go install hermes" hint is gated on HERMES_PRESENT=0:
      expect(r.body).toMatch(/if \[ "\$HERMES_PRESENT" = "0" \]/)
    })

    it('warns that rc edits do not affect the current shell', async () => {
      // Regression guard: users kept running "curl install/hermes | bash"
      // followed by the Hermes installer in the same shell and picking up
      // stale env vars. The script must tell them to source the rc or paste
      // the two exports into the current shell.
      const r = await get('/install/hermes')
      expect(r.body).toMatch(/本会话仍是旧值/)
      expect(r.body).toMatch(/source \$RC_SHORT/)
    })

    it('uses short rc paths (~/.bashrc) in user-facing messages', async () => {
      // Regression guard: we previously printed the absolute $RC path, which
      // was harder to recognize than ~/.bashrc / ~/.zshrc.
      const r = await get('/install/hermes')
      expect(r.body).toContain('RC_SHORT="~/.bashrc"')
      expect(r.body).toContain('RC_SHORT="~/.zshrc"')
      // And the "already written" log uses the short form:
      expect(r.body).toMatch(/已写入 \$RC_SHORT/)
    })

    it('supports fish as well as bash/zsh', async () => {
      const r = await get('/install/hermes')
      expect(r.body).toMatch(/fish\)/)
      expect(r.body).toMatch(/set -gx ANTHROPIC_BASE_URL/)
      expect(r.body).toMatch(/set -gx ANTHROPIC_API_KEY/)
    })

    it('honors HERMES_LINK_API_KEY for non-interactive use', async () => {
      const r = await get('/install/hermes')
      expect(r.body).toContain('${HERMES_LINK_API_KEY:-}')
    })
  })
})
