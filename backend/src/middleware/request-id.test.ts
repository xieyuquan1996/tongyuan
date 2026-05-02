import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { requestId } from './request-id.js'

function mkApp() {
  const app = new Hono()
  app.use('*', requestId)
  app.get('/', (c) => c.json({ id: c.get('requestId') }))
  return app
}

describe('requestId middleware', () => {
  it('mints a req_<ulid> when no inbound header is set', async () => {
    const app = mkApp()
    const r = await app.fetch(new Request('http://x/'))
    const id = r.headers.get('x-request-id')
    expect(id).toMatch(/^req_[0-9A-HJKMNP-TV-Z]+$/)
    const body = await r.json() as { id: string }
    expect(body.id).toBe(id)
  })

  it('echoes a safe inbound x-request-id back', async () => {
    const app = mkApp()
    const r = await app.fetch(new Request('http://x/', {
      headers: { 'x-request-id': 'trace-abc123' },
    }))
    expect(r.headers.get('x-request-id')).toBe('trace-abc123')
  })

  it('rejects an inbound id with characters outside the whitelist', async () => {
    // We accept the same allowlist as ulid + uuid + common hex/short ids
    // (alphanumeric, dash, underscore, colon, dot). Anything else — spaces,
    // semicolons, slashes — gets dropped to defend log/header consumers
    // that don't escape carefully. The Headers constructor already blocks
    // CR/LF before middleware sees it; this test covers the next layer.
    const app = mkApp()
    const r = await app.fetch(new Request('http://x/', {
      headers: { 'x-request-id': 'has spaces and ;semicolons' },
    }))
    const id = r.headers.get('x-request-id')!
    expect(id).toMatch(/^req_[0-9A-HJKMNP-TV-Z]+$/)
  })

  it('rejects an oversized inbound id', async () => {
    const app = mkApp()
    const r = await app.fetch(new Request('http://x/', {
      headers: { 'x-request-id': 'a'.repeat(200) },
    }))
    const id = r.headers.get('x-request-id')!
    expect(id).toMatch(/^req_/)
  })
})
