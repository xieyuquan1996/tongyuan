import { describe, it, expect, vi, afterEach } from 'vitest'
import { sendWebhook } from './webhook-sender.js'

afterEach(() => { vi.restoreAllMocks() })

describe('sendWebhook', () => {
  it('POST JSON payload，无 token 时不带 Authorization header', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }) as any,
    )

    const result = await sendWebhook('https://example.com/hook', null, { kind: 'balance_low', threshold: 5 })

    expect(result.ok).toBe(true)
    expect(result.statusCode).toBe(200)
    const [url, init] = mockFetch.mock.calls[0]!
    expect(url).toBe('https://example.com/hook')
    expect((init as RequestInit).method).toBe('POST')
    expect(((init as RequestInit).headers as Record<string, string>)['Authorization']).toBeUndefined()
  })

  it('有 token 时带 Bearer Authorization header', async () => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }) as any,
    )

    await sendWebhook('https://example.com/hook', 'my-secret', { kind: 'balance_low' })

    const [, init] = mockFetch.mock.calls[0]!
    expect(((init as RequestInit).headers as Record<string, string>)['Authorization']).toBe('Bearer my-secret')
  })

  it('非 2xx 响应 → ok=false, statusCode 正确', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Bad Gateway', { status: 502 }) as any,
    )

    const result = await sendWebhook('https://example.com/hook', null, {})

    expect(result.ok).toBe(false)
    expect(result.statusCode).toBe(502)
  })

  it('网络异常 → ok=false, statusCode undefined', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await sendWebhook('https://example.com/hook', null, {})

    expect(result.ok).toBe(false)
    expect(result.statusCode).toBeUndefined()
  })
})
