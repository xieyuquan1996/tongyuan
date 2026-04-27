// backend/src/shared/canonicalize.test.ts
import { describe, it, expect } from 'vitest'
import { canonicalize, hashBody } from './canonicalize.js'

describe('canonicalize', () => {
  it('sorts keys and drops null/undefined', () => {
    const a = canonicalize({ b: 2, a: 1, c: null, d: undefined })
    expect(a).toBe('{"a":1,"b":2}')
  })

  it('same semantics → same hash regardless of key order', () => {
    const h1 = hashBody({ model: 'x', messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 })
    const h2 = hashBody({ max_tokens: 10, messages: [{ content: 'hi', role: 'user' }], model: 'x' })
    expect(h1).toBe(h2)
  })

  it('different messages → different hash', () => {
    const h1 = hashBody({ model: 'x', messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 })
    const h2 = hashBody({ model: 'x', messages: [{ role: 'user', content: 'hello' }], max_tokens: 10 })
    expect(h1).not.toBe(h2)
  })
})
