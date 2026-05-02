import { describe, it, expect, beforeEach } from 'vitest'

// We have to set env BEFORE importing the module under test, because
// crypto/apikey-hmac.ts caches the pepper on first call.
process.env.SESSION_SECRET ??= 'a'.repeat(48)
process.env.DATABASE_URL ??= 'postgres://u:p@h:5432/d'
process.env.REDIS_URL ??= 'redis://h:6379'
process.env.UPSTREAM_KEY_KMS ??= 'b'.repeat(64)

const { hmacApiKey, _resetPepperForTests } = await import('./apikey-hmac.js')

describe('hmacApiKey', () => {
  beforeEach(() => {
    _resetPepperForTests()
    delete process.env.API_KEY_HMAC_PEPPER
  })

  it('is deterministic for the same secret', () => {
    const a = hmacApiKey('sk-relay-abc123')
    const b = hmacApiKey('sk-relay-abc123')
    expect(a).toBe(b)
  })

  it('produces 64 hex chars (sha256)', () => {
    const h = hmacApiKey('sk-relay-xyz')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('differs across distinct secrets', () => {
    const a = hmacApiKey('sk-relay-aaa')
    const b = hmacApiKey('sk-relay-bbb')
    expect(a).not.toBe(b)
  })

})
