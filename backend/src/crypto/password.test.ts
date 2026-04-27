// backend/src/crypto/password.test.ts
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './password.js'

describe('password', () => {
  it('hashes and verifies', async () => {
    const h = await hashPassword('secret123')
    expect(h).not.toBe('secret123')
    expect(await verifyPassword('secret123', h)).toBe(true)
    expect(await verifyPassword('wrong', h)).toBe(false)
  })
})
