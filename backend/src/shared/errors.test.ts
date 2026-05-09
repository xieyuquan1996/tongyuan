// backend/src/shared/errors.test.ts
import { describe, it, expect } from 'vitest'
import { AppError, RateLimitError, toErrorBody } from './errors.js'

describe('AppError', () => {
  it('maps code to http status', () => {
    expect(new AppError('unauthorized').status).toBe(401)
    expect(new AppError('insufficient_balance').status).toBe(402)
    expect(new AppError('not_found').status).toBe(404)
    expect(new AppError('all_upstreams_down').status).toBe(502)
  })

  it('serializes body', () => {
    const e = new AppError('invalid_email', 'bad format')
    expect(toErrorBody(e)).toEqual({ error: 'invalid_email', message: 'bad format' })
  })

  it('wraps unknown as mock_error', () => {
    const e = new Error('oops')
    const body = toErrorBody(e)
    expect(body.error).toBe('internal_error')
  })

  it('hides raw error message for internal errors in production', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const body = toErrorBody(new Error('SELECT * FROM users WHERE id=1'))
      expect(body.error).toBe('internal_error')
      expect(body.message).toBeUndefined()
    } finally {
      process.env.NODE_ENV = prev
    }
  })

  it('omits message when it equals the code (no custom message)', () => {
    const body = toErrorBody(new AppError('unauthorized'))
    expect(body.message).toBeUndefined()
    expect(body.error).toBe('unauthorized')
  })
})

describe('RateLimitError', () => {
  it('is an AppError with status 429', () => {
    const e = new RateLimitError('60 RPM exceeded', { retryAfterSec: 12, limitRequests: 60 })
    expect(e).toBeInstanceOf(AppError)
    expect(e.status).toBe(429)
    expect(e.code).toBe('rate_limit')
  })

  it('includes Retry-After and X-RateLimit-* headers', () => {
    const e = new RateLimitError('60 RPM exceeded', { retryAfterSec: 12, limitRequests: 60, remainingRequests: 0 })
    expect(e.rateLimitHeaders['retry-after']).toBe('12')
    expect(e.rateLimitHeaders['x-ratelimit-limit-requests']).toBe('60')
    expect(e.rateLimitHeaders['x-ratelimit-remaining-requests']).toBe('0')
    expect(e.rateLimitHeaders['x-ratelimit-reset-requests']).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('includes token headers when limitTokens is provided', () => {
    const e = new RateLimitError('TPM exceeded', { retryAfterSec: 5, limitTokens: 100000 })
    expect(e.rateLimitHeaders['x-ratelimit-limit-tokens']).toBe('100000')
    expect(e.rateLimitHeaders['x-ratelimit-remaining-tokens']).toBe('0')
  })
})
