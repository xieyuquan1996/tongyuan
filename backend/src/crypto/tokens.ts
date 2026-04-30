// backend/src/crypto/tokens.ts
import { createHash, randomBytes } from 'node:crypto'

export const API_KEY_PREFIX_LEN = 16  // 'sk-relay-' + 7 chars

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
function randAlphanum(n: number): string {
  // 64-char alphabet (A-Z a-z 0-9 - _) divides 256 cleanly → no bias, no rejection.
  const buf = randomBytes(n)
  let out = ''
  for (let i = 0; i < n; i++) out += ALPHABET[buf[i]! & 0x3f]
  return out
}

export function newApiKey(): { secret: string; prefix: string } {
  const secret = 'sk-relay-' + randAlphanum(80)
  return { secret, prefix: secret.slice(0, API_KEY_PREFIX_LEN) }
}
