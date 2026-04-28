// backend/src/routes/console/playground.ts
import { Hono } from 'hono'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { ensurePlaygroundKey } from '../../services/api-keys.js'
import { getById as getModel } from '../../services/models.js'
import { handleNonStream } from '../../gateway/handle-messages.js'
import { AppError } from '../../shared/errors.js'

export const playgroundRoutes = new Hono()
playgroundRoutes.use('*', requireBearer)

playgroundRoutes.post('/', async (c) => {
  const user = c.get('user')
  const rawBody = await c.req.text()
  let body: any
  try { body = JSON.parse(rawBody) } catch { throw new AppError('missing_fields', 'invalid json') }
  if (!body.model || !Array.isArray(body.messages)) throw new AppError('missing_fields')
  if (body.stream === true) throw new AppError('not_implemented', 'playground streams land later')

  const model = await getModel(body.model)
  if (!model.enabled) throw new AppError('unknown_model')

  const apiKey = await ensurePlaygroundKey(user.id)
  const started = Date.now()
  const res = await handleNonStream(c, {
    user,
    apiKey,
    body,
    rawBody,
    model,
    idempotencyKey: c.req.header('idempotency-key') ?? null,
    anthropicVersion: c.req.header('anthropic-version') ?? '2023-06-01',
  })
  const latencyMs = Date.now() - started
  const text = await res.text()
  let parsed: any = null
  try { parsed = JSON.parse(text) } catch {}
  if (!parsed) return new Response(text, { status: res.status, headers: { 'content-type': 'application/json' } })
  parsed.latencyMs = latencyMs
  return c.json(parsed, res.status as any)
})
