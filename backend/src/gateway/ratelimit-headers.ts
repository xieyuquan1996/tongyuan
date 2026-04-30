// Parse Anthropic / RFC-compliant rate-limit signals into a wall-clock reset
// time. Anthropic sets per-family headers we can act on precisely; standard
// Retry-After is the fallback.

export function parseRetryAfterMs(headers: Headers, now = Date.now()): number | null {
  // Anthropic emits anthropic-ratelimit-{requests,input-tokens,output-tokens}-reset
  // as an ISO8601 timestamp. We take the earliest non-past one.
  const keys = [
    'anthropic-ratelimit-requests-reset',
    'anthropic-ratelimit-input-tokens-reset',
    'anthropic-ratelimit-output-tokens-reset',
  ]
  let earliest: number | null = null
  for (const k of keys) {
    const v = headers.get(k)
    if (!v) continue
    const t = Date.parse(v)
    if (Number.isFinite(t) && t > now) {
      earliest = earliest === null ? t : Math.min(earliest, t)
    }
  }
  if (earliest !== null) return earliest - now

  const ra = headers.get('retry-after')
  if (ra) {
    const seconds = Number(ra)
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000
    const t = Date.parse(ra)
    if (Number.isFinite(t) && t > now) return t - now
  }
  return null
}
