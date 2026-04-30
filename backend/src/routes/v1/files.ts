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
// We do NOT run these through the rate-limit or quota machinery — those are
// tuned for the per-minute token budget on /v1/messages. Files API calls are
// metadata ops and shouldn't count against ITPM/OTPM.

import { Hono } from 'hono'
import { requireApiKey } from '../../middleware/auth-api-key.js'
import { AppError } from '../../shared/errors.js'
import { scheduler } from '../../gateway/scheduler.js'
import { getAnthropicBaseUrl } from '../../env.js'

export const v1Files = new Hono()
v1Files.use('*', requireApiKey)

// Pick the first active upstream — Files API responses include a file_id
// that's tied to the uploading account, so we can't round-robin across
// different upstream keys for the same file_id. In practice admins usually
// run with one primary key; if that's not the case, the caller has to be
// aware that Anthropic's file_id is account-scoped.
async function pickUpstream() {
  const pool = await scheduler.snapshot()
  if (pool.length === 0) throw new AppError('all_upstreams_down')
  return pool[0]!
}

async function forwardFiles(req: Request, pathSuffix: string): Promise<Response> {
  const upstream = await pickUpstream()
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

v1Files.post('/', async (c) => forwardFiles(c.req.raw, ''))
v1Files.get('/', async (c) => forwardFiles(c.req.raw, ''))
v1Files.get('/:file_id', async (c) => forwardFiles(c.req.raw, '/' + c.req.param('file_id')))
v1Files.get('/:file_id/content', async (c) => forwardFiles(c.req.raw, '/' + c.req.param('file_id') + '/content'))
v1Files.delete('/:file_id', async (c) => forwardFiles(c.req.raw, '/' + c.req.param('file_id')))
