// backend/src/crypto/tokens.ts
import { createHash, randomBytes } from 'node:crypto'

export const API_KEY_PREFIX_LEN = 16  // 'sk-relay-' + 7 chars

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
function randBase62(n: number): string {
  const buf = randomBytes(n)
  let out = ''
  for (let i = 0; i < n; i++) out += BASE62[buf[i]! % 62]
  return out
}

export function newApiKey(): { secret: string; prefix: string } {
  const secret = 'sk-relay-' + randBase62(40)
  return { secret, prefix: secret.slice(0, API_KEY_PREFIX_LEN) }
}
