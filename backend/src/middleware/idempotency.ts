// backend/src/middleware/idempotency.ts
import type { MiddlewareHandler, Context } from 'hono'
import { redis } from '../redis/client.js'

const TTL_SEC = 24 * 3600
const SENTINEL = '__PENDING__'

export type IdemKeyFn = (c: Context) => string | null

// Cache non-stream POST responses keyed by Idempotency-Key. Concurrent
// requests with the same key that arrive while the first is still in-flight
// receive 409 idempotency_in_flight; clients can retry.
export function idempotency(getKey: IdemKeyFn): MiddlewareHandler {
  return async (c, next) => {
    const key = getKey(c)
    if (!key) return next()

    // Claim the key atomically. NX + EX gives us a reservation window.
    const claimed = await redis.set(key, SENTINEL, 'EX', TTL_SEC, 'NX')
    if (claimed !== 'OK') {
      const stored = await redis.get(key)
      if (!stored || stored === SENTINEL) {
        return c.json({ error: 'idempotency_in_flight', message: 'try again' }, 409)
      }
      const parsed = JSON.parse(stored) as { status: number; body: string; contentType: string }
      return new Response(parsed.body, {
        status: parsed.status,
        headers: {
          'content-type': parsed.contentType,
          'x-idempotent-replay': 'true',
        },
      })
    }

    // We own the key — run the handler, then persist the response.
    await next()
    const res = c.res
    if (!res) return
    const body = await res.clone().text()
    const payload = JSON.stringify({
      status: res.status,
      body,
      contentType: res.headers.get('content-type') ?? 'application/json',
    })
    await redis.set(key, payload, 'EX', TTL_SEC)
  }
}
