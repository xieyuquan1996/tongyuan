import { describe, it, expect } from 'vitest'
import { createApp } from '../app.js'
import { gatewayRequests } from '../observability/metrics.js'

describe('metrics route', () => {
  const app = createApp()

  it('sets security headers on all responses', async () => {
    const r = await app.fetch(new Request('http://x/healthz'))
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('x-frame-options')).toBe('DENY')
    expect(r.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(r.headers.get('x-permitted-cross-domain-policies')).toBe('none')
  })

  it('sets security headers on error responses', async () => {
    const r = await app.fetch(new Request('http://x/api/console/nonexistent-route'))
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('x-frame-options')).toBe('DENY')
  })

  it('exposes prometheus text exposition on GET /metrics', async () => {
    // Seed a counter so its HELP/TYPE lines appear in output.
    gatewayRequests.inc({ model: 'claude-opus-4-7', status: '200' })

    const r = await app.fetch(new Request('http://x/metrics'))
    expect(r.status).toBe(200)
    const ct = r.headers.get('content-type') ?? ''
    expect(ct).toContain('text/plain')
    const body = await r.text()
    expect(body).toContain('# HELP gateway_requests_total')
    expect(body).toContain('# TYPE gateway_requests_total counter')
    expect(body).toContain('gateway_requests_total{model="claude-opus-4-7",status="200"}')
  })
})
