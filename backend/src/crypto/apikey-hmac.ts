// HMAC fingerprint for API keys.
//
// Why HMAC and not bcrypt: API keys are 80 random base64url chars after the
// `sk-relay-` prefix. That's >480 bits of entropy — bcrypt's slow-by-design
// cost factor exists to defend against low-entropy human passwords, which
// doesn't apply here. HMAC-SHA256 is preimage-resistant for high-entropy
// inputs and lets us store the fingerprint in a UNIQUE index, so verify is
// a single `WHERE secret_hmac = $1` query instead of bcrypt-comparing every
// row that shares a prefix.
//
// The pepper is server-side only and never leaves this process. We derive it
// from SESSION_SECRET so existing deployments don't need a new env var; if
// you'd prefer to rotate API key fingerprints independently of session keys,
// set API_KEY_HMAC_PEPPER explicitly.

import { createHmac } from 'node:crypto'
import { env } from '../env.js'

let _pepper: Buffer | null = null

function pepper(): Buffer {
  if (_pepper) return _pepper
  // Domain-separate from any other use of SESSION_SECRET. The fixed prefix
  // means an attacker who learns the session secret can't reuse it directly
  // as the API key pepper.
  const secret = env.API_KEY_HMAC_PEPPER ?? `apikey-hmac:v1:${env.SESSION_SECRET}`
  _pepper = Buffer.from(secret, 'utf8')
  return _pepper
}

export function hmacApiKey(secret: string): string {
  return createHmac('sha256', pepper()).update(secret).digest('hex')
}

// Test seam: lets unit tests reset the cached pepper after env mutation.
export function _resetPepperForTests(): void {
  _pepper = null
}
