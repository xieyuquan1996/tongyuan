import { Hono } from 'hono'
import { and, desc, eq } from 'drizzle-orm'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { db } from '../../db/client.js'
import { requestLogs } from '../../db/schema.js'
import { AppError } from '../../shared/errors.js'

export const logsRoutes = new Hono()
logsRoutes.use('*', requireBearer)

logsRoutes.get('/', async (c) => {
  const status = c.req.query('status')
  const model = c.req.query('model')
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200)
  const userId = c.get('user').id

  const conds = [eq(requestLogs.userId, userId)]
  if (status) conds.push(eq(requestLogs.status, status))
  if (model) conds.push(eq(requestLogs.model, model))

  const rows = await db.select().from(requestLogs)
    .where(and(...conds))
    .orderBy(desc(requestLogs.createdAt))
    .limit(limit)

  return c.json({
    logs: rows.map((r) => ({
      id: r.id,
      status: Number(r.status),
      model: r.model,
      latency_ms: Number(r.latencyMs),
      tokens: Number(r.inputTokens) + Number(r.outputTokens),
      cost: Number(r.costUsd).toFixed(4),
      region: 'cn-east-1',
      created_at: r.createdAt,
      audit_match: r.auditMatch,
    })),
    total: rows.length,
  })
})

logsRoutes.get('/:id', async (c) => {
  const row = await db.query.requestLogs.findFirst({
    where: and(eq(requestLogs.id, c.req.param('id')), eq(requestLogs.userId, c.get('user').id)),
  })
  if (!row) throw new AppError('not_found')
  return c.json({
    log: {
      id: row.id, status: Number(row.status), model: row.model,
      latency_ms: Number(row.latencyMs), tokens: Number(row.inputTokens) + Number(row.outputTokens),
      cost: Number(row.costUsd).toFixed(4), region: 'cn-east-1',
      created_at: row.createdAt, audit_match: row.auditMatch,
    },
    audit: {
      upstream_endpoint: `https://api.anthropic.com${row.endpoint}`,
      request_hash: row.requestHash,
      upstream_request_hash: row.upstreamRequestHash,
      match: row.auditMatch,
    },
  })
})
