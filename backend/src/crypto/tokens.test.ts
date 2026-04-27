// backend/src/crypto/tokens.test.ts
import { describe, it, expect } from 'vitest'
import { newSessionToken, hashSessionToken, newApiKey, API_KEY_PREFIX_LEN } from './tokens.js'

describe('tokens', () => {
  it('session token is base64url 43-char and hash is deterministic', () => {
    const t = newSessionToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(hashSessionToken(t)).toBe(hashSessionToken(t))
    expect(hashSessionToken(t)).not.toBe(t)
  })

  it('api key starts with sk-relay- and exposes stable prefix', () => {
    const { secret, prefix } = newApiKey()
    expect(secret.startsWith('sk-relay-')).toBe(true)
    expect(prefix).toBe(secret.slice(0, API_KEY_PREFIX_LEN))
  })
})
