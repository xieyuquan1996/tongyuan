// backend/src/routes/v1/chat-completions.ts
import { Hono } from 'hono'
import { requireApiKey } from '../../middleware/auth-api-key.js'
import { rateLimit, DEFAULT_RPM } from '../../middleware/rate-limit.js'
import { getById as getModel } from '../../services/models.js'
import { handleNonStream, handleStream } from '../../gateway/handle-messages.js'
import { oaiToAnthropic, anthropicToOai, transformAnthropicStream } from '../../gateway/openai-compat.js'
import { AppError } from '../../shared/errors.js'

export const v1ChatCompletions = new Hono()

v1ChatCompletions.use('*', requireApiKey)
v1ChatCompletions.use('*', rateLimit((c) => {
  const apiKey = c.get('apiKey')
  const bucket = Math.floor(Date.now() / 60_000)
  return {
    key: `rl:api_key:${apiKey.id}:${bucket}`,
    limit: apiKey.rpmLimit ? Number(apiKey.rpmLimit) : DEFAULT_RPM,
    windowSec: 60,
  }
}))

v1ChatCompletions.post('/', async (c) => {
  const user = c.get('user')
  const apiKey = c.get('apiKey')

  const rawOai = await c.req.text()
  let oaiBody: any
  try { oaiBody = JSON.parse(rawOai) } catch { throw new AppError('missing_fields', 'invalid json') }
  if (!oaiBody.model) throw new AppError('missing_fields', 'model required')
  if (!Array.isArray(oaiBody.messages)) throw new AppError('missing_fields', 'messages required')

  const model = await getModel(oaiBody.model)
  if (!model.enabled) throw new AppError('unknown_model', `${oaiBody.model} disabled`)

  const { anthropicBody, rawBody } = oaiToAnthropic(oaiBody)

  const input = {
    user, apiKey,
    body: anthropicBody,
    rawBody,
    model,
    idempotencyKey: c.req.header('idempotency-key') ?? null,
    anthropicVersion: '2023-06-01',
  }

  if (oaiBody.stream === true) {
    // Get the Anthropic SSE stream, then transform it to OpenAI SSE format
    const anthropicResp = await handleStream(c, input)
    if (!anthropicResp.body) return c.text('upstream error', 502)

    const oaiStream = transformAnthropicStream(anthropicResp.body, oaiBody.model)
    return new Response(oaiStream, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'x-accel-buffering': 'no',
      },
    })
  }

  // Non-streaming: get Anthropic response, convert to OpenAI format
  const anthropicResp = await handleNonStream(c, input)
  const text = await anthropicResp.text()
  let parsed: any
  try { parsed = JSON.parse(text) } catch { return new Response(text, { status: anthropicResp.status }) }

  if (!anthropicResp.ok) {
    // Pass through errors in OpenAI error format
    return c.json({
      error: {
        message: parsed.error?.message ?? parsed.error ?? 'upstream error',
        type: parsed.error?.type ?? 'api_error',
        code: parsed.error?.code ?? null,
      }
    }, anthropicResp.status as any)
  }

  return c.json(anthropicToOai(parsed))
})
