// backend/src/routes/v1/messages.ts
import { Hono } from 'hono'
import { ulid } from 'ulid'
import { requireApiKey } from '../../middleware/auth-api-key.js'
import { hashBody } from '../../shared/canonicalize.js'
import { getById as getModel } from '../../services/models.js'
import { forwardNonStream } from '../../gateway/proxy.js'
import { computeCost } from '../../gateway/meter.js'
import { commitRequest } from '../../gateway/biller.js'
import { AppError } from '../../shared/errors.js'

export const v1Messages = new Hono()

v1Messages.use('*', requireApiKey)

v1Messages.post('/', async (c) => {
  const started = Date.now()
  const user = c.get('user')
  const apiKey = c.get('apiKey')

  const rawBody = await c.req.text()
  let body: any
  try { body = JSON.parse(rawBody) } catch { throw new AppError('missing_fields', 'invalid json') }
  if (!body.model) throw new AppError('missing_fields', 'model required')
  if (!Array.isArray(body.messages)) throw new AppError('missing_fields', 'messages required')

  const model = await getModel(body.model)
  if (!model.enabled) throw new AppError('unknown_model', `${body.model} disabled`)
  if (body.stream === true) {
    return c.json({ error: 'not_implemented', message: 'streaming lands in Task 30' }, 501 as 501)
  }

  const requestHash = hashBody(body)
  const forwardBody = JSON.stringify(body)
  const upstreamRequestHash = hashBody(JSON.parse(forwardBody))

  const { upstream, response } = await forwardNonStream('/v1/messages', {
    'anthropic-version': c.req.header('anthropic-version') ?? '2023-06-01',
  }, forwardBody)

  const text = await response.text()
  let parsed: any = null
  try { parsed = JSON.parse(text) } catch {}
  const usage = parsed?.usage ?? {}

  const inputTokens = Number(usage.input_tokens ?? 0)
  const outputTokens = Number(usage.output_tokens ?? 0)
  const cacheReadTokens = Number(usage.cache_read_input_tokens ?? 0)
  const cacheWriteTokens = Number(usage.cache_creation_input_tokens ?? 0)

  const { costUsd, chargeUsd } = computeCost({
    inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
    model: {
      inputPriceUsdPerMtok: model.inputPriceUsdPerMtok,
      outputPriceUsdPerMtok: model.outputPriceUsdPerMtok,
      cacheReadPriceUsdPerMtok: model.cacheReadPriceUsdPerMtok,
      cacheWritePriceUsdPerMtok: model.cacheWritePriceUsdPerMtok,
      markupPct: model.markupPct,
    },
  })

  await commitRequest({
    id: 'req_' + ulid(),
    userId: user.id,
    apiKeyId: apiKey.id,
    upstreamKeyId: upstream.id,
    model: body.model,
    upstreamModel: parsed?.model ?? body.model,
    endpoint: '/v1/messages',
    stream: false,
    status: response.status,
    errorCode: response.status >= 400 ? `upstream_${response.status}` : null,
    latencyMs: Date.now() - started,
    ttfbMs: null,
    inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
    chargeUsd, costUsd,
    requestHash, upstreamRequestHash,
    auditMatch: requestHash === upstreamRequestHash,
    idempotencyKey: c.req.header('idempotency-key') ?? null,
  })

  return new Response(text, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  })
})
