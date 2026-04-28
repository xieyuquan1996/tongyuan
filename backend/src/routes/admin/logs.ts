// backend/src/routes/admin/logs.ts
import { Hono } from 'hono'
import { and, desc, eq, ilike, sql } from 'drizzle-orm'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import { db } from '../../db/client.js'
import { requestLogs, users } from '../../db/schema.js'
import { AppError } from '../../shared/errors.js'

export const adminLogsRoutes = new Hono()
adminLogsRoutes.use('*', requireBearer, requireAdmin)

adminLogsRoutes.get('/', async (c) => {
  const status = c.req.query('status')
  const model = c.req.query('model')
  const userEmail = c.req.query('user_email')
  const limit = Math.min(Number(c.req.query('limit') ?? 100), 500)

  const conds = []
  if (status) conds.push(eq(requestLogs.status, status))
  if (model) conds.push(eq(requestLogs.model, model))
  if (userEmail) conds.push(ilike(users.email, `%${userEmail}%`))

  const rows = await db.select({
    id: requestLogs.id,
    status: requestLogs.status,
    model: requestLogs.model,
    latencyMs: requestLogs.latencyMs,
    inputTokens: requestLogs.inputTokens,
    outputTokens: requestLogs.outputTokens,
    costUsd: requestLogs.costUsd,
    createdAt: requestLogs.createdAt,
    auditMatch: requestLogs.auditMatch,
    errorCode: requestLogs.errorCode,
    userEmail: users.email,
  }).from(requestLogs)
    .innerJoin(users, eq(users.id, requestLogs.userId))
    .where(conds.length ? and(...conds) : undefined)
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
      error_code: r.errorCode,
      user_email: r.userEmail,
      owner_email: r.userEmail,
    })),
    total: rows.length,
  })
})

adminLogsRoutes.get('/:id', async (c) => {
  const row = await db.query.requestLogs.findFirst({
    where: eq(requestLogs.id, c.req.param('id')),
  })
  if (!row) throw new AppError('not_found')
  const u = await db.query.users.findFirst({ where: eq(users.id, row.userId) })

  return c.json({
    log: {
      id: row.id, status: Number(row.status), model: row.model,
      latency_ms: Number(row.latencyMs),
      tokens: Number(row.inputTokens) + Number(row.outputTokens),
      cost: Number(row.costUsd).toFixed(4),
      region: 'cn-east-1',
      created_at: row.createdAt,
      audit_match: row.auditMatch,
      user_email: u?.email ?? null,
      owner_email: u?.email ?? null,
    },
    audit: {
      upstream_endpoint: `https://api.anthropic.com${row.endpoint}`,
      request_hash: row.requestHash,
      upstream_request_hash: row.upstreamRequestHash,
      match: row.auditMatch,
      model_hash: `sha256:${row.requestHash.slice(0, 16)}...${row.requestHash.slice(-8)}`,
      max_tokens: 0,
      system_len: 0,
      messages_len: 0,
    },
  })
})
