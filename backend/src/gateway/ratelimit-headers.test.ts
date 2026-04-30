import { describe, it, expect } from 'vitest'
import { parseRetryAfterMs } from './ratelimit-headers.js'

describe('parseRetryAfterMs', () => {
  it('prefers the earliest anthropic reset header', () => {
    const now = 1_700_000_000_000
    const headers = new Headers({
      'anthropic-ratelimit-requests-reset': new Date(now + 5_000).toISOString(),
      'anthropic-ratelimit-input-tokens-reset': new Date(now + 30_000).toISOString(),
    })
    expect(parseRetryAfterMs(headers, now)).toBe(5_000)
  })

  it('ignores past resets', () => {
    const now = 1_700_000_000_000
    const headers = new Headers({
      'anthropic-ratelimit-requests-reset': new Date(now - 5_000).toISOString(),
      'retry-after': '2',
    })
    expect(parseRetryAfterMs(headers, now)).toBe(2_000)
  })

  it('falls back to retry-after seconds', () => {
    const headers = new Headers({ 'retry-after': '7' })
    expect(parseRetryAfterMs(headers, 0)).toBe(7_000)
  })

  it('returns null when no header is present', () => {
    expect(parseRetryAfterMs(new Headers(), 0)).toBeNull()
  })
})
