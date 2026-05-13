// backend/src/routes/v1/files.ts
//
// Transparent proxy for Anthropic's Files API (files-api-2025-04-14 beta).
// We don't persist file bytes locally — we just forward the request body to
// one upstream key, return the response verbatim, and let Anthropic hold the
// file_id mapping. Billing happens later when the file is referenced from
// /v1/messages; this endpoint itself is free per the pricing doc.
//
// Supported operations (all passed through unchanged):
//   POST   /v1/files                     — upload
//   GET    /v1/files                     — list
//   GET    /v1/files/:file_id            — metadata
//   GET    /v1/files/:file_id/content    — download
//   DELETE /v1/files/:file_id            — delete
//
// We do NOT run these through the token-quota (ITPM/OTPM) machinery — those
// are tuned for /v1/messages. But we do apply RPM limiting: file operations
// still proxy to Anthropic and a misbehaving client could exhaust the upstream
// account's request quota by bulk-uploading or repeatedly downloading.

import { Hono } from 'hono'
import { requireApiKey } from '../../middleware/auth-api-key.js'
import { rateLimit, DEFAULT_RPM } from '../../middleware/rate-limit.js'
import { AppError } from '../../shared/errors.js'
import { scheduler } from '../../gateway/scheduler.js'
import { getAnthropicBaseUrl } from '../../env.js'
import { stickyOrder } from '../../gateway/proxy.js'

export const v1Files = new Hono()
v1Files.use('*', requireApiKey)
v1Files.use('*', rateLimit((c) => {
  const apiKey = c.get('apiKey')
  return {
    key: `files:${apiKey.id}`,
    limit: apiKey.rpmLimit ? Number(apiKey.rpmLimit) : DEFAULT_RPM,
  }
}))

// Pick the preferred upstream for this apiKey using sticky routing. Files API
// responses include a file_id tied to the uploading Anthropic account, so the
// same user should consistently hit the same upstream. If that upstream is down,
// the next in the sticky order is used (file_ids from the old key won't work,
// but at least the endpoint stays available).
async function pickUpstream(apiKeyId: string) {
  const pool = await scheduler.snapshot()
  if (pool.length === 0) throw new AppError('all_upstreams_down')
  return stickyOrder(pool, apiKeyId)[0]!
}

async function forwardFiles(req: Request, pathSuffix: string, apiKeyId: string): Promise<Response> {
  const upstream = await pickUpstream(apiKeyId)
  const apiKey = await scheduler.decrypt(upstream)
  const baseUrl = upstream.baseUrl ?? getAnthropicBaseUrl()
  // Carry the original query string through (e.g. ?limit=20&after_id=...).
  const incomingSearch = new URL(req.url).search
  const target = new URL(`/v1/files${pathSuffix}${incomingSearch}`, baseUrl).toString()

  // Preserve the caller's headers except for ones we want to override. In
  // particular: strip Host / x-api-key / authorization so we set them fresh,
  // but keep content-type (multipart boundary, etc.) and anthropic-beta.
  const headers = new Headers()
  req.headers.forEach((v, k) => {
    const lower = k.toLowerCase()
    if (lower === 'host' || lower === 'x-api-key' || lower === 'authorization') return
    if (lower === 'content-length') return // fetch will recompute
    headers.set(k, v)
  })
  headers.set('x-api-key', apiKey)
  headers.set('anthropic-version', req.headers.get('anthropic-version') ?? '2023-06-01')
  // Files API still lives behind the beta header as of files-api-2025-04-14.
  // Prefer whatever the caller sent, else default to the current beta name.
  if (!headers.has('anthropic-beta')) headers.set('anthropic-beta', 'files-api-2025-04-14')

  const init: RequestInit = {
    method: req.method,
    headers,
  }
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE') {
    // Stream the body straight through — no buffering. Needed for large
    // uploads to avoid materializing 32 MB in memory.
    init.body = req.body
    // @ts-expect-error Node's undici needs duplex:'half' when sending a stream
    init.duplex = 'half'
  }

  const res = await fetch(target, init)
  // Copy response back verbatim — body, status, headers. Anthropic's file
  // metadata contains file_id / filename / size_bytes etc. that the client
  // needs unchanged.
  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  })
}

v1Files.post('/', async (c) => forwardFiles(c.req.raw, '', c.get('apiKey').id))
v1Files.get('/', async (c) => forwardFiles(c.req.raw, '', c.get('apiKey').id))
v1Files.get('/:file_id', async (c) => forwardFiles(c.req.raw, '/' + c.req.param('file_id'), c.get('apiKey').id))
v1Files.get('/:file_id/content', async (c) => forwardFiles(c.req.raw, '/' + c.req.param('file_id') + '/content', c.get('apiKey').id))
v1Files.delete('/:file_id', async (c) => forwardFiles(c.req.raw, '/' + c.req.param('file_id'), c.get('apiKey').id))
