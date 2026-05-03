// backend/src/routes/console/playground.ts
import { Hono } from 'hono'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import { ensurePlaygroundKey } from '../../services/api-keys.js'
import { getById as getModel } from '../../services/models.js'
import { handleNonStream, handleStream } from '../../gateway/handle-messages.js'
import { AppError } from '../../shared/errors.js'

export const playgroundRoutes = new Hono()
// Playground 已迁到后台管理，只允许 admin 调用，防止普通用户刷 token。
playgroundRoutes.use('*', requireBearer, requireAdmin)

// Playground reuses the gateway's /v1/messages plumbing — same admission
// control, same audit hash, same biller — but takes a session bearer
// (instead of an sk-relay-* key) and auto-provisions a per-user "playground"
// API key so the request still lands as a real billable row in request_logs.
//
// Stream handling: when the client asks for stream:true, we hand the
// response off to handleStream which writes SSE frames straight through
// from the upstream. The non-stream branch tacks `latencyMs` onto the
// JSON body for the UI's "请求耗时" pill.
playgroundRoutes.post('/', async (c) => {
  const user = c.get('user')
  const rawBody = await c.req.text()
  let body: any
  try { body = JSON.parse(rawBody) } catch { throw new AppError('missing_fields', 'invalid json') }
  if (!body.model || !Array.isArray(body.messages)) throw new AppError('missing_fields')

  const model = await getModel(body.model)
  if (!model.enabled) throw new AppError('unknown_model')

  const apiKey = await ensurePlaygroundKey(user.id)
  const input = {
    user,
    apiKey,
    body,
    rawBody,
    model,
    idempotencyKey: c.req.header('idempotency-key') ?? null,
    anthropicVersion: c.req.header('anthropic-version') ?? '2023-06-01',
  }

  if (body.stream === true) {
    // handleStream writes c.res itself via hono/streaming and returns the
    // streaming Response. No latency wrapper here — clients reading SSE
    // already see TTFB on the first frame, and we'd have to rewrite the
    // event stream to inject it which isn't worth the complexity.
    return handleStream(c, input)
  }

  const started = Date.now()
  const res = await handleNonStream(c, input)
  const latencyMs = Date.now() - started
  const text = await res.text()
  let parsed: any = null
  try { parsed = JSON.parse(text) } catch {}
  if (!parsed) return new Response(text, { status: res.status, headers: { 'content-type': 'application/json' } })
  parsed.latencyMs = latencyMs
  return c.json(parsed, res.status as any)
})
