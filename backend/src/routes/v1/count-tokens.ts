// backend/src/routes/v1/count-tokens.ts
import { Hono } from 'hono'
import { requireApiKey } from '../../middleware/auth-api-key.js'
import { rateLimit, DEFAULT_RPM } from '../../middleware/rate-limit.js'
import { forwardNonStream } from '../../gateway/proxy.js'

export const v1CountTokens = new Hono()
v1CountTokens.use('*', requireApiKey)
// count_tokens calls are cheap but still proxy to the upstream, consuming
// quota. Apply the same per-key RPM limit as /v1/messages so a misbehaving
// client can't exhaust upstream quota by spamming token counting.
v1CountTokens.use('*', rateLimit((c) => {
  const apiKey = c.get('apiKey')
  return {
    key: `ct:${apiKey.id}`,
    limit: apiKey.rpmLimit ? Number(apiKey.rpmLimit) : DEFAULT_RPM,
  }
}))

v1CountTokens.post('/', async (c) => {
  const apiKey = c.get('apiKey')
  const body = await c.req.text()
  const { response } = await forwardNonStream('/v1/messages/count_tokens', {
    'anthropic-version': c.req.header('anthropic-version') ?? '2023-06-01',
  }, body, undefined, apiKey.id)
  const text = await response.text()
  return new Response(text, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  })
})
