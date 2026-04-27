// backend/src/routes/v1/messages.ts
import { Hono } from 'hono'
import { requireApiKey } from '../../middleware/auth-api-key.js'
import { rateLimit, DEFAULT_RPM } from '../../middleware/rate-limit.js'
import { getById as getModel } from '../../services/models.js'
import { handleNonStream, handleStream } from '../../gateway/handle-messages.js'
import { AppError } from '../../shared/errors.js'

export const v1Messages = new Hono()

v1Messages.use('*', requireApiKey)
v1Messages.use('*', rateLimit((c) => {
  const apiKey = c.get('apiKey')
  const bucket = Math.floor(Date.now() / 60_000)
  return {
    key: `rl:api_key:${apiKey.id}:${bucket}`,
    limit: apiKey.rpmLimit ? Number(apiKey.rpmLimit) : DEFAULT_RPM,
    windowSec: 60,
  }
}))

v1Messages.post('/', async (c) => {
  const user = c.get('user')
  const apiKey = c.get('apiKey')

  const rawBody = await c.req.text()
  let body: any
  try { body = JSON.parse(rawBody) } catch { throw new AppError('missing_fields', 'invalid json') }
  if (!body.model) throw new AppError('missing_fields', 'model required')
  if (!Array.isArray(body.messages)) throw new AppError('missing_fields', 'messages required')

  const model = await getModel(body.model)
  if (!model.enabled) throw new AppError('unknown_model', `${body.model} disabled`)

  const input = {
    user, apiKey, body, rawBody, model,
    idempotencyKey: c.req.header('idempotency-key') ?? null,
    anthropicVersion: c.req.header('anthropic-version') ?? '2023-06-01',
  }

  if (body.stream === true) {
    return handleStream(c, input)
  }
  return handleNonStream(c, input)
})
