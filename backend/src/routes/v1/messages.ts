// backend/src/routes/v1/messages.ts
import { Hono } from 'hono'
import { ulid } from 'ulid'
import { stream } from 'hono/streaming'
import { requireApiKey } from '../../middleware/auth-api-key.js'
import { hashBody } from '../../shared/canonicalize.js'
import { getById as getModel } from '../../services/models.js'
import { forwardNonStream, forwardStream } from '../../gateway/proxy.js'
import { computeCost } from '../../gateway/meter.js'
import { commitRequest } from '../../gateway/biller.js'
import { AppError } from '../../shared/errors.js'
import { extractUsage, iterSSE } from '../../gateway/sse.js'
import type { UpstreamRow } from '../../services/upstream-keys.js'

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
    return streamHandler(c, body, rawBody, started, user, apiKey)
  }

  const requestHash = hashBody(body)
  const forwardBody = JSON.stringify(body)
  // Fix 4: hashBody canonicalizes internally, no need to re-parse forwardBody
  const upstreamRequestHash = hashBody(body)

  const id = 'req_' + ulid()
  let upstream: UpstreamRow | null = null
  let response: Response | null = null
  let errorCode: string | null = null

  try {
    const att = await forwardNonStream('/v1/messages', {
      'anthropic-version': c.req.header('anthropic-version') ?? '2023-06-01',
    }, forwardBody)
    upstream = att.upstream
    response = att.response
  } catch (e) {
    if (e instanceof AppError) {
      errorCode = e.code
    } else {
      errorCode = 'upstream_error'
    }
  }

  if (!response || !upstream) {
    // Fix 1: log the failure so there is always an audit trail, then re-throw
    await commitRequest({
      id,
      userId: user.id,
      apiKeyId: apiKey.id,
      upstreamKeyId: null,
      model: body.model,
      upstreamModel: body.model,
      endpoint: '/v1/messages',
      stream: false,
      status: 502,
      errorCode,
      latencyMs: Date.now() - started,
      ttfbMs: null,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      chargeUsd: '0', costUsd: '0',
      requestHash, upstreamRequestHash,
      auditMatch: requestHash === upstreamRequestHash,
      idempotencyKey: c.req.header('idempotency-key') ?? null,
    })
    throw new AppError((errorCode as any) ?? 'all_upstreams_down')
  }

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
    id,
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

async function streamHandler(
  c: any, body: any, rawBody: string, started: number,
  user: any, apiKey: any,
) {
  const model = await getModel(body.model)
  if (!model.enabled) throw new AppError('unknown_model')

  const requestHash = hashBody(body)
  const forwardBody = rawBody
  const upstreamRequestHash = hashBody(body)

  const id = 'req_' + ulid()
  let upstream: UpstreamRow | null = null
  let response: Response | null = null
  let errorCode: string | null = null

  try {
    const att = await forwardStream('/v1/messages', {
      'anthropic-version': c.req.header('anthropic-version') ?? '2023-06-01',
    }, forwardBody)
    upstream = att.upstream
    response = att.response
  } catch (e) {
    if (e instanceof AppError) {
      errorCode = e.code
    } else {
      errorCode = 'upstream_error'
    }
  }

  if (!response || !upstream) {
    await commitRequest({
      id,
      userId: user.id,
      apiKeyId: apiKey.id,
      upstreamKeyId: null,
      model: body.model,
      upstreamModel: body.model,
      endpoint: '/v1/messages',
      stream: true,
      status: 502,
      errorCode,
      latencyMs: Date.now() - started,
      ttfbMs: null,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      chargeUsd: '0', costUsd: '0',
      requestHash, upstreamRequestHash,
      auditMatch: requestHash === upstreamRequestHash,
      idempotencyKey: c.req.header('idempotency-key') ?? null,
    })
    throw new AppError((errorCode as any) ?? 'all_upstreams_down')
  }

  const usage = extractUsage()
  let ttfbMs: number | null = null
  let upstreamModel = body.model

  c.header('content-type', response.headers.get('content-type') ?? 'text/event-stream')
  c.header('cache-control', 'no-cache')
  c.header('connection', 'keep-alive')
  c.status(response.status as 200)

  return stream(c, async (outStream) => {
    try {
      if (!response!.body) {
        await outStream.write(new Uint8Array())
        return
      }
      for await (const ev of iterSSE(response!.body)) {
        if (ttfbMs === null) ttfbMs = Date.now() - started
        usage.observe(ev.event, ev.data)
        if (ev.event === 'message_start' && ev.data?.message?.model) {
          upstreamModel = ev.data.message.model
        }
        await outStream.write(new TextEncoder().encode(ev.raw))
      }
    } finally {
      const snap = usage.snapshot()
      const { costUsd, chargeUsd } = computeCost({
        ...snap,
        model: {
          inputPriceUsdPerMtok: model.inputPriceUsdPerMtok,
          outputPriceUsdPerMtok: model.outputPriceUsdPerMtok,
          cacheReadPriceUsdPerMtok: model.cacheReadPriceUsdPerMtok,
          cacheWritePriceUsdPerMtok: model.cacheWritePriceUsdPerMtok,
          markupPct: model.markupPct,
        },
      })
      await commitRequest({
        id,
        userId: user.id,
        apiKeyId: apiKey.id,
        upstreamKeyId: upstream!.id,
        model: body.model,
        upstreamModel,
        endpoint: '/v1/messages',
        stream: true,
        status: response!.status,
        errorCode: response!.status >= 400 ? `upstream_${response!.status}` : null,
        latencyMs: Date.now() - started,
        ttfbMs,
        inputTokens: snap.inputTokens,
        outputTokens: snap.outputTokens,
        cacheReadTokens: snap.cacheReadTokens,
        cacheWriteTokens: snap.cacheWriteTokens,
        chargeUsd, costUsd,
        requestHash, upstreamRequestHash,
        auditMatch: requestHash === upstreamRequestHash,
        idempotencyKey: c.req.header('idempotency-key') ?? null,
      })
    }
  })
}
