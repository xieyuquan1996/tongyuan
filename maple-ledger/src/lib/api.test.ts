import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api } from './api.js'

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch')
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('api()', () => {
  it('calls fetch with correct path and returns json', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: '1' }]), { status: 200 })
    )
    const result = await api<{ id: string }[]>('/api/transactions')
    expect(fetch).toHaveBeenCalledWith('/api/transactions', expect.any(Object))
    expect(result).toEqual([{ id: '1' }])
  })

  it('throws on non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'not_found' }), { status: 404 })
    )
    await expect(api('/api/transactions/bad')).rejects.toThrow()
  })

  it('sends POST body as JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'new' }), { status: 201 })
    )
    await api('/api/transactions', { method: 'POST', body: { amount: 100 } })
    expect(fetch).toHaveBeenCalledWith('/api/transactions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ amount: 100 }),
    }))
  })
})
