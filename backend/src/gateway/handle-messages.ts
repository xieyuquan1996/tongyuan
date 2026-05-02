// backend/src/gateway/handle-messages.ts
import type { Context } from 'hono'
import { stream } from 'hono/streaming'
import { ulid } from 'ulid'
import { hashBody } from '../shared/canonicalize.js'
import { forwardNonStream, forwardStream, type Reservation } from './proxy.js'
import { computeCost } from './meter.js'
import { commitRequest } from './biller.js'
import { AppError } from '../shared/errors.js'
import { extractUsage, iterSSE, splitCacheWrite } from './sse.js'
import * as quota from './quota.js'
import * as tpm from '../middleware/tpm-limit.js'
import { estimateInputTokens, estimateOutputTokens } from './estimate.js'
import type { UpstreamRow } from '../services/upstream-keys.js'
import type { ModelRow } from '../services/models.js'
import type { ApiKeyRow } from '../services/api-keys.js'
import type { UserRow } from '../services/users.js'

export type HandleMessagesInput = {
  user: UserRow
  apiKey: ApiKeyRow
  body: any
  rawBody: string
  model: ModelRow
  idempotencyKey: string | null
  anthropicVersion: string
}

// Reconcile the reservation with actual usage. cache_read tokens are excluded
// from ITPM by Anthropic, so we pass (inputTokens - cacheReadTokens) as the
// "real" input cost. cache_creation is billable but *does* count toward ITPM.
async function reconcile(
  reservation: Reservation,
  realInputExclCache: number,
  realOutput: number,
): Promise<void> {
  await quota.commit(
    reservation.upstreamId,
    reservation.family,
    reservation.bucket,
    reservation.estIn,
    reservation.estOut,
    realInputExclCache,
    realOutput,
  )
}

// Reserve per-key TPM admission against the user's tpm_limit (if any).
// Returns null when no limit is configured. Throws rate_limit if the cap
// would be exceeded — the caller should let that propagate.
async function reserveTpm(apiKey: ApiKeyRow, body: any): Promise<tpm.TpmReservation | null> {
  const cap = apiKey.tpmLimit ? Number(apiKey.tpmLimit) : null
  if (!cap || !Number.isFinite(cap) || cap <= 0) return null
  const estIn = estimateInputTokens(body)
  // Use cap itself as the OTPM ceiling for sizing purposes — a single
  // request can't reserve more than the per-minute cap regardless of
  // max_tokens.
  const estOut = estimateOutputTokens(body, cap)
  return tpm.reserve(apiKey.id, cap, estIn + estOut)
}

export async function handleNonStream(c: Context, input: HandleMessagesInput): Promise<Response> {
  const started = Date.now()
  const { user, apiKey, body, model, idempotencyKey, anthropicVersion } = input

  const requestHash = hashBody(body)
  const forwardBody = JSON.stringify(body)
  const upstreamRequestHash = hashBody(body)

  // Reuse the id stamped by the requestId middleware so the response header
  // and the request_logs row are the same string. Fallback for callers that
  // bypass createApp() (shouldn't happen in production).
  const id = c.get('requestId') ?? ('req_' + ulid())
  let upstream: UpstreamRow | null = null
  let response: Response | null = null
  let reservation: Reservation | null = null
  let errorCode: string | null = null
  // Reserve up-front so a hot key gets 429'd before we burn upstream budget.
  // If the user hasn't set a TPM limit, this is a no-op.
  const tpmReservation = await reserveTpm(apiKey, body)

  try {
    const att = await forwardNonStream('/v1/messages', {
      'anthropic-version': anthropicVersion,
    }, forwardBody)
    upstream = att.upstream
    response = att.response
    reservation = att.reservation
  } catch (e) {
    if (e instanceof AppError) {
      errorCode = e.code
    } else {
      errorCode = 'upstream_error'
    }
  }

  if (!response || !upstream || !reservation) {
    if (tpmReservation) await tpm.release(tpmReservation)
    await commitRequest({
      id,
      userId: user.id,
      apiKeyId: apiKey.id,
      upstreamKeyId: null,
      model: body.model,
      upstreamModel: body.model,
      endpoint: '/v1/messages',
      stream: false,
      status: errorCode === 'rate_limit' ? 429 : 502,
      errorCode,
      latencyMs: Date.now() - started,
      ttfbMs: null,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cacheWrite1hTokens: 0,
      chargeUsd: '0', costUsd: '0',
      requestHash, upstreamRequestHash,
      auditMatch: requestHash === upstreamRequestHash,
      idempotencyKey,
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
  const { w5m: cacheWriteTokens, w1h: cacheWrite1hTokens } = splitCacheWrite(usage)

  // Anthropic's ITPM excludes cache reads. Both 5m and 1h writes count toward
  // ITPM, so we reconcile on the combined write total.
  await reconcile(reservation, inputTokens + cacheWriteTokens + cacheWrite1hTokens, outputTokens)
  // Reconcile per-key TPM against actual usage (input + output, billable).
  if (tpmReservation) {
    await tpm.reconcile(tpmReservation, inputTokens + outputTokens)
  }

  const { costUsd, chargeUsd } = computeCost({
    inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, cacheWrite1hTokens,
    model: {
      inputPriceUsdPerMtok: model.inputPriceUsdPerMtok,
      outputPriceUsdPerMtok: model.outputPriceUsdPerMtok,
      cacheReadPriceUsdPerMtok: model.cacheReadPriceUsdPerMtok,
      cacheWritePriceUsdPerMtok: model.cacheWritePriceUsdPerMtok,
      cacheWrite1hPriceUsdPerMtok: model.cacheWrite1hPriceUsdPerMtok,
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
    inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, cacheWrite1hTokens,
    chargeUsd, costUsd,
    requestHash, upstreamRequestHash,
    auditMatch: requestHash === upstreamRequestHash,
    idempotencyKey,
  })

  return new Response(text, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  })
}

export async function handleStream(c: Context, input: HandleMessagesInput): Promise<Response> {
  const started = Date.now()
  const { user, apiKey, body, rawBody, model, idempotencyKey, anthropicVersion } = input

  const requestHash = hashBody(body)
  const forwardBody = rawBody
  const upstreamRequestHash = hashBody(body)

  const id = c.get('requestId') ?? ('req_' + ulid())
  let upstream: UpstreamRow | null = null
  let response: Response | null = null
  let reservation: Reservation | null = null
  let errorCode: string | null = null
  const tpmReservation = await reserveTpm(apiKey, body)

  try {
    const att = await forwardStream('/v1/messages', {
      'anthropic-version': anthropicVersion,
    }, forwardBody)
    upstream = att.upstream
    response = att.response
    reservation = att.reservation
  } catch (e) {
    if (e instanceof AppError) {
      errorCode = e.code
    } else {
      errorCode = 'upstream_error'
    }
  }

  if (!response || !upstream || !reservation) {
    if (tpmReservation) await tpm.release(tpmReservation)
    await commitRequest({
      id,
      userId: user.id,
      apiKeyId: apiKey.id,
      upstreamKeyId: null,
      model: body.model,
      upstreamModel: body.model,
      endpoint: '/v1/messages',
      stream: true,
      status: errorCode === 'rate_limit' ? 429 : 502,
      errorCode,
      latencyMs: Date.now() - started,
      ttfbMs: null,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cacheWrite1hTokens: 0,
      chargeUsd: '0', costUsd: '0',
      requestHash, upstreamRequestHash,
      auditMatch: requestHash === upstreamRequestHash,
      idempotencyKey,
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
      try {
        for await (const ev of iterSSE(response!.body)) {
          if (ttfbMs === null) ttfbMs = Date.now() - started
          usage.observe(ev.event, ev.data)
          if (ev.event === 'message_start' && ev.data?.message?.model) {
            upstreamModel = ev.data.message.model
          }
          await outStream.write(new TextEncoder().encode(ev.raw))
        }
      } finally {
        try { await response!.body?.cancel() } catch {}
      }
    } finally {
      const snap = usage.snapshot()
      await reconcile(reservation!, snap.inputTokens + snap.cacheWriteTokens + snap.cacheWrite1hTokens, snap.outputTokens)
      if (tpmReservation) {
        await tpm.reconcile(tpmReservation, snap.inputTokens + snap.outputTokens)
      }
      const { costUsd, chargeUsd } = computeCost({
        ...snap,
        model: {
          inputPriceUsdPerMtok: model.inputPriceUsdPerMtok,
          outputPriceUsdPerMtok: model.outputPriceUsdPerMtok,
          cacheReadPriceUsdPerMtok: model.cacheReadPriceUsdPerMtok,
          cacheWritePriceUsdPerMtok: model.cacheWritePriceUsdPerMtok,
          cacheWrite1hPriceUsdPerMtok: model.cacheWrite1hPriceUsdPerMtok,
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
        cacheWrite1hTokens: snap.cacheWrite1hTokens,
        chargeUsd, costUsd,
        requestHash, upstreamRequestHash,
        auditMatch: requestHash === upstreamRequestHash,
        idempotencyKey,
      })
    }
  })
}
