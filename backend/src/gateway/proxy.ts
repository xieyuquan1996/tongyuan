// backend/src/gateway/proxy.ts
import { env } from '../env.js'
import { scheduler } from './scheduler.js'
import { AppError } from '../shared/errors.js'
import type { UpstreamRow } from '../services/upstream-keys.js'

export type ProxyAttempt = {
  upstream: UpstreamRow
  response: Response
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

export async function forwardNonStream(
  path: string,
  headers: Record<string, string>,
  body: string,
): Promise<ProxyAttempt> {
  const pool = await scheduler.snapshot()
  if (pool.length === 0) throw new AppError('all_upstreams_down')

  const tried: { id: string; status: number | 'network' }[] = []
  for (let i = 0; i < Math.min(pool.length, 3); i++) {
    const upstream = pool[i]!
    const apiKey = await scheduler.decrypt(upstream)
    const url = new URL(path, env.ANTHROPIC_UPSTREAM_BASE_URL).toString()
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'x-api-key': apiKey,
          'anthropic-version': headers['anthropic-version'] ?? '2023-06-01',
          'content-type': 'application/json',
        },
        body,
      })
      if (RETRYABLE_STATUS.has(res.status)) {
        tried.push({ id: upstream.id, status: res.status })
        await scheduler.cooldown(upstream.id, res.status === 429 ? 60_000 : 300_000, `http_${res.status}`)
        continue
      }
      return { upstream, response: res }
    } catch (e) {
      tried.push({ id: upstream.id, status: 'network' })
      await scheduler.cooldown(upstream.id, 300_000, 'network_error')
      continue
    }
  }
  throw new AppError('all_upstreams_down', `tried ${JSON.stringify(tried)}`)
}

export async function forwardStream(
  path: string,
  headers: Record<string, string>,
  body: string,
): Promise<ProxyAttempt> {
  const pool = await scheduler.snapshot()
  if (pool.length === 0) throw new AppError('all_upstreams_down')

  const tried: { id: string; status: number | 'network' }[] = []
  for (let i = 0; i < Math.min(pool.length, 3); i++) {
    const upstream = pool[i]!
    const apiKey = await scheduler.decrypt(upstream)
    const url = new URL(path, env.ANTHROPIC_UPSTREAM_BASE_URL).toString()
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'x-api-key': apiKey,
          'anthropic-version': headers['anthropic-version'] ?? '2023-06-01',
          'content-type': 'application/json',
          'accept': 'text/event-stream',
        },
        body,
      })
      if (RETRYABLE_STATUS.has(res.status)) {
        tried.push({ id: upstream.id, status: res.status })
        await scheduler.cooldown(upstream.id, res.status === 429 ? 60_000 : 300_000, `http_${res.status}`)
        try { await res.body?.cancel() } catch {}
        continue
      }
      return { upstream, response: res }
    } catch {
      tried.push({ id: upstream.id, status: 'network' })
      await scheduler.cooldown(upstream.id, 300_000, 'network_error')
      continue
    }
  }
  throw new AppError('all_upstreams_down', `tried ${JSON.stringify(tried)}`)
}
