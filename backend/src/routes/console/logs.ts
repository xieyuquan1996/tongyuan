import { Hono } from 'hono'
import { and, desc, eq, count } from 'drizzle-orm'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { db } from '../../db/client.js'
import { requestLogs } from '../../db/schema.js'
import { AppError } from '../../shared/errors.js'
import { parseStatusFilter, serializeTokenFields, serializeFacets } from '../shared/logs-helpers.js'

export const logsRoutes = new Hono()
logsRoutes.use('*', requireBearer)

logsRoutes.get('/', async (c) => {
  const status = c.req.query('status')
  const model = c.req.query('model')
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200)
  const offset = Math.max(Number(c.req.query('offset') ?? 0), 0)
  const userId = c.get('user').id

  const conds = [eq(requestLogs.userId, userId)]
  if (status) conds.push(parseStatusFilter(status))
  if (model) conds.push(eq(requestLogs.model, model))

  const where = and(...conds)

  const [rows, countRows, statusFacet, modelFacet] = await Promise.all([
    db.select().from(requestLogs)
      .where(where)
      .orderBy(desc(requestLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(requestLogs).where(where),
    db.selectDistinct({ status: requestLogs.status }).from(requestLogs)
      .where(eq(requestLogs.userId, userId)),
    db.selectDistinct({ model: requestLogs.model }).from(requestLogs)
      .where(eq(requestLogs.userId, userId)),
  ])

  return c.json({
    logs: rows.map((r) => ({
      id: r.id,
      status: Number(r.status),
      model: r.model,
      latency_ms: Number(r.latencyMs),
      ...serializeTokenFields(r),
      cost: Number(r.costUsd).toFixed(4),
      region: 'cn-east-1',
      type: r.endpoint?.includes('/batches') ? 'Batch' : r.stream ? 'SSE' : 'HTTP',
      stream: r.stream,
      service_tier: 'Standard',
      endpoint: r.endpoint,
      created_at: r.createdAt,
      audit_match: r.auditMatch,
    })),
    total: countRows[0]?.total ?? 0,
    facets: serializeFacets(statusFacet, modelFacet),
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
      latency_ms: Number(row.latencyMs), tokens: serializeTokenFields(row).tokens,
      cost: Number(row.costUsd).toFixed(4), region: 'cn-east-1',
      created_at: row.createdAt, audit_match: row.auditMatch,
    },
    audit: {
      upstream_endpoint: `https://api.anthropic.com${row.endpoint}`,
      request_hash: row.requestHash,
      upstream_request_hash: row.upstreamRequestHash,
      match: row.auditMatch,
      // Derived / stub fields for the audit drawer. Real values require
      // persisting request body metadata at log time (deferred).
      model_hash: `sha256:${row.requestHash.slice(0, 16)}...${row.requestHash.slice(-8)}`,
      max_tokens: 0,
      system_len: 0,
      messages_len: 0,
    },
  })
})
