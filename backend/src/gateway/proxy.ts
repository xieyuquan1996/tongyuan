// backend/src/gateway/proxy.ts
import { getAnthropicBaseUrl } from '../env.js'
import { scheduler } from './scheduler.js'
import { AppError } from '../shared/errors.js'
import type { UpstreamRow } from '../services/upstream-keys.js'
import { familyOf, type Family } from './family.js'
import { estimateInputTokens, estimateOutputTokens } from './estimate.js'
import * as quota from './quota.js'
import { resolveBudget } from './quota-config.js'
import { parseRetryAfterMs } from './ratelimit-headers.js'

export type Reservation = {
  upstreamId: string
  family: Family
  bucket: number
  estIn: number
  estOut: number
}

export type ProxyAttempt = {
  upstream: UpstreamRow
  response: Response
  reservation: Reservation
}

const RETRYABLE_STATUS = new Set([408, 500, 502, 503, 504])

function resolveBaseUrl(upstream: UpstreamRow): string {
  return upstream.baseUrl ?? getAnthropicBaseUrl()
}

// Walk the active upstream pool looking for a key that can reserve the
// family's per-minute budget. Returns the reservation + key, or null if none
// have headroom.
async function reserveOne(family: Family, body: any): Promise<{ upstream: UpstreamRow; res: Reservation } | null> {
  const pool = await scheduler.snapshot()
  if (pool.length === 0) return null
  for (const upstream of pool) {
    // Per-key budget: an admin can give each upstream its own limits (Scale
    // tier vs Build Tier 1, etc.), so we resolve inside the loop.
    const budget = await resolveBudget(upstream.id, family)
    const estIn = estimateInputTokens(body)
    const estOut = estimateOutputTokens(body, budget.otpm)
    const r = await quota.reserve(upstream.id, family, budget, estIn, estOut)
    if (r.ok) {
      return { upstream, res: { upstreamId: upstream.id, family, bucket: r.bucket, estIn: r.estIn, estOut: r.estOut } }
    }
  }
  return null
}

type ForwardArgs = {
  path: string
  headers: Record<string, string>
  body: string
  bodyJson: any
  stream: boolean
}

async function forward({ path, headers, body, bodyJson, stream }: ForwardArgs): Promise<ProxyAttempt> {
  const family = familyOf(String(bodyJson?.model ?? ''))

  const tried: { id: string; status: number | 'network' | 'no_budget' }[] = []
  // Give each request up to N attempts — one per key — to ride through 429s
  // that land mid-flight after reserve() said we had headroom.
  const MAX_ATTEMPTS = 4
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const got = await reserveOne(family, bodyJson)
    if (!got) {
      // No key has headroom. If we've tried nothing yet and there are no
      // active upstreams at all, the classic all_upstreams_down applies.
      const pool = await scheduler.snapshot()
      if (pool.length === 0) throw new AppError('all_upstreams_down')
      tried.push({ id: 'pool', status: 'no_budget' })
      throw new AppError('rate_limit', 'all upstream keys saturated')
    }
    const { upstream, res: reservation } = got
    const apiKey = await scheduler.decrypt(upstream)
    const url = new URL(path, resolveBaseUrl(upstream)).toString()
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'x-api-key': apiKey,
          'anthropic-version': headers['anthropic-version'] ?? '2023-06-01',
          'content-type': 'application/json',
          ...(stream ? { 'accept': 'text/event-stream' } : {}),
        },
        body,
      })

      if (res.status === 429) {
        // Anthropic tells us when this family resets. Park just that family
        // on this key until the reset so parallel Sonnet traffic on the same
        // key keeps flowing while Opus sits out the minute.
        const retryAfterMs = parseRetryAfterMs(res.headers) ?? 60_000
        await quota.markFamilyCooldown(upstream.id, family, Date.now() + retryAfterMs, 'http_429')
        await quota.release(upstream.id, family, reservation.bucket, reservation.estIn, reservation.estOut)
        tried.push({ id: upstream.id, status: 429 })
        try { await res.body?.cancel() } catch {}
        continue
      }

      if (RETRYABLE_STATUS.has(res.status)) {
        // 5xx / timeout isn't a quota problem — fail the whole key briefly.
        await scheduler.cooldown(upstream.id, 300_000, `http_${res.status}`)
        await quota.release(upstream.id, family, reservation.bucket, reservation.estIn, reservation.estOut)
        tried.push({ id: upstream.id, status: res.status })
        try { await res.body?.cancel() } catch {}
        continue
      }

      return { upstream, response: res, reservation }
    } catch {
      await scheduler.cooldown(upstream.id, 300_000, 'network_error')
      await quota.release(upstream.id, family, reservation.bucket, reservation.estIn, reservation.estOut)
      tried.push({ id: upstream.id, status: 'network' })
      continue
    }
  }
  throw new AppError('all_upstreams_down', `tried ${JSON.stringify(tried)}`)
}

export async function forwardNonStream(
  path: string,
  headers: Record<string, string>,
  body: string,
): Promise<ProxyAttempt> {
  let parsed: any = {}
  try { parsed = JSON.parse(body) } catch {}
  return forward({ path, headers, body, bodyJson: parsed, stream: false })
}

export async function forwardStream(
  path: string,
  headers: Record<string, string>,
  body: string,
): Promise<ProxyAttempt> {
  let parsed: any = {}
  try { parsed = JSON.parse(body) } catch {}
  return forward({ path, headers, body, bodyJson: parsed, stream: true })
}
