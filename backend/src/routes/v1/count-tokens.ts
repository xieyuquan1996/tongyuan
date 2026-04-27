// backend/src/routes/v1/count-tokens.ts
import { Hono } from 'hono'
import { requireApiKey } from '../../middleware/auth-api-key.js'
import { forwardNonStream } from '../../gateway/proxy.js'

export const v1CountTokens = new Hono()
v1CountTokens.use('*', requireApiKey)

v1CountTokens.post('/', async (c) => {
  const body = await c.req.text()
  const { response } = await forwardNonStream('/v1/messages/count_tokens', {
    'anthropic-version': c.req.header('anthropic-version') ?? '2023-06-01',
  }, body)
  const text = await response.text()
  return new Response(text, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  })
})
