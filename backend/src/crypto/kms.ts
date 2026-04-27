// backend/src/crypto/kms.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// key: 64 hex chars (32 bytes). returns base64(iv || tag || ciphertext).
export function encryptSecret(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) throw new Error('KMS key must be 32 bytes (64 hex chars)')
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([c.update(plaintext, 'utf8'), c.final()])
  const tag = c.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptSecret(packed: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const buf = Buffer.from(packed, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const d = createDecipheriv('aes-256-gcm', key, iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8')
}
