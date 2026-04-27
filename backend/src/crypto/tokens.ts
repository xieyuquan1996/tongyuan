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
  // Rejection sampling to avoid modulo bias. Uniform threshold = floor(256/62)*62 = 248.
  const THRESHOLD = 248
  let out = ''
  while (out.length < n) {
    const buf = randomBytes(n - out.length + 8)  // slight overdraw to reduce retries
    for (let i = 0; i < buf.length && out.length < n; i++) {
      const b = buf[i]!
      if (b < THRESHOLD) out += BASE62[b % 62]
    }
  }
  return out
}

export function newApiKey(): { secret: string; prefix: string } {
  const secret = 'sk-relay-' + randBase62(40)
  return { secret, prefix: secret.slice(0, API_KEY_PREFIX_LEN) }
}
