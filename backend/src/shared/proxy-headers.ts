// Headers that must NOT be forwarded to the upstream — either because we
// replace them ourselves (x-api-key, content-type, accept) or because they
// are connection/transport-level (host, connection, etc.) or are our own
// auth layer (authorization).
const EXCLUDED = new Set([
  'authorization',
  'x-api-key',
  'host',
  'connection',
  'keep-alive',
  'content-length',
  'transfer-encoding',
  'te',
  'upgrade',
  'proxy-authorization',
  'proxy-connection',
])

// Extract all client request headers that are safe to forward to Anthropic.
// We strip our auth layer (authorization, x-api-key) and connection-level
// headers, and let the proxy layer inject x-api-key with the upstream secret.
export function extractUpstreamHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    if (!EXCLUDED.has(key.toLowerCase())) {
      out[key.toLowerCase()] = value
    }
  })
  return out
}

// Return just the query string (without leading '?'), or undefined if none.
export function extractQueryString(url: string): string | undefined {
  const idx = url.indexOf('?')
  if (idx === -1) return undefined
  const qs = url.slice(idx + 1)
  return qs || undefined
}
