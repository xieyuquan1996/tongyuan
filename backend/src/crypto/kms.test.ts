// backend/src/crypto/kms.test.ts
import { describe, it, expect } from 'vitest'
import { encryptSecret, decryptSecret } from './kms.js'

const KEY = 'a'.repeat(64)

describe('kms', () => {
  it('roundtrips', () => {
    const ct = encryptSecret('sk-ant-api03-XYZ', KEY)
    expect(ct).not.toContain('sk-ant')
    expect(decryptSecret(ct, KEY)).toBe('sk-ant-api03-XYZ')
  })

  it('fails with wrong key', () => {
    const ct = encryptSecret('secret', KEY)
    expect(() => decryptSecret(ct, 'b'.repeat(64))).toThrow()
  })
})
