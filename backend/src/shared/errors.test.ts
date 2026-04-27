// backend/src/shared/errors.test.ts
import { describe, it, expect } from 'vitest'
import { AppError, toErrorBody } from './errors.js'

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
})
