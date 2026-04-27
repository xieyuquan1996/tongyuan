// backend/src/routes/console/logs.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../../app.js'
import { pool, db } from '../../db/client.js'
import { requestLogs } from '../../db/schema.js'

const app = createApp()
let token = ''
let userId = ''
let apiKeyId = ''
const logIds: string[] = []

beforeAll(async () => {
  const email = `logs-test-${Date.now()}@example.com`
  await pool.query(`DELETE FROM users WHERE email LIKE 'logs-test-%'`)
  const r = await app.fetch(new Request('http://x/api/console/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', name: 'T' }),
  }))
  const j = await r.json()
  token = j.session.token
  userId = j.user.id

  const kr = await app.fetch(new Request('http://x/api/console/keys', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'test-key' }),
  }))
  apiKeyId = (await kr.json()).id

  const ts = Date.now()
  logIds.push(`req_logs_t1_${ts}`, `req_logs_t2_${ts + 1}`, `req_logs_t3_${ts + 2}`)

  await db.insert(requestLogs).values([
    {
      id: logIds[0]!, userId, apiKeyId,
      model: 'claude-3-5-sonnet-20241022', upstreamModel: 'claude-3-5-sonnet-20241022',
      endpoint: '/v1/messages', stream: false, status: '200',
      latencyMs: '100', inputTokens: '10', outputTokens: '20',
      cacheReadTokens: '0', cacheWriteTokens: '0', costUsd: '0.001',
      requestHash: 'lhash1', upstreamRequestHash: 'luhash1', auditMatch: true,
    },
    {
      id: logIds[1]!, userId, apiKeyId,
      model: 'claude-3-5-sonnet-20241022', upstreamModel: 'claude-3-5-sonnet-20241022',
      endpoint: '/v1/messages', stream: false, status: '500',
      latencyMs: '200', inputTokens: '5', outputTokens: '0',
      cacheReadTokens: '0', cacheWriteTokens: '0', costUsd: '0.000',
      requestHash: 'lhash2', upstreamRequestHash: 'luhash2', auditMatch: false,
    },
    {
      id: logIds[2]!, userId, apiKeyId,
      model: 'claude-3-5-sonnet-20241022', upstreamModel: 'claude-3-5-sonnet-20241022',
      endpoint: '/v1/messages', stream: false, status: '429',
      latencyMs: '50', inputTokens: '0', outputTokens: '0',
      cacheReadTokens: '0', cacheWriteTokens: '0', costUsd: '0.000',
      requestHash: 'lhash3', upstreamRequestHash: 'luhash3', auditMatch: false,
    },
  ])
})

afterAll(async () => { await pool.end() })

async function req(path: string, init: RequestInit = {}) {
  return app.fetch(new Request('http://x' + path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers as any) },
  }))
}

describe('logs routes', () => {
  it('filters by status=500', async () => {
    const r = await req('/api/console/logs?status=500')
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.logs).toHaveLength(1)
    expect(j.logs[0].status).toBe(500)
  })

  it('GET /:id returns log + audit shape', async () => {
    const r = await req(`/api/console/logs/${logIds[0]}`)
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.log).toBeDefined()
    expect(j.audit).toBeDefined()
    expect(j.audit.request_hash).toBe('lhash1')
    expect(j.audit.upstream_endpoint).toContain('/v1/messages')
    expect(j.audit.system_len).toBe(0)
    expect(j.audit.messages_len).toBe(0)
    expect(j.audit.max_tokens).toBe(0)
    expect(j.audit.model_hash).toMatch(/^sha256:/)
  })

  it('GET /:id with non-owned id returns 404', async () => {
    const r = await req('/api/console/logs/req_nonexistent_id')
    expect(r.status).toBe(404)
  })

  it('GET /:id cross-user access returns 404', async () => {
    // Register user B
    const emailB = `logs-test-b-${Date.now()}@example.com`
    const rb = await app.fetch(new Request('http://x/api/console/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: emailB, password: 'secret123', name: 'B' }),
    }))
    const jb = await rb.json()
    const tokenB = jb.session.token
    const userIdB = jb.user.id

    // Give B an API key and insert a log owned by B
    const kr = await app.fetch(new Request('http://x/api/console/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ name: 'b-key' }),
    }))
    const apiKeyIdB = (await kr.json()).id

    const logIdB = `req_logs_b_${Date.now()}`
    await db.insert(requestLogs).values({
      id: logIdB, userId: userIdB, apiKeyId: apiKeyIdB,
      model: 'claude-3-5-sonnet-20241022', upstreamModel: 'claude-3-5-sonnet-20241022',
      endpoint: '/v1/messages', stream: false, status: '200',
      latencyMs: '100', inputTokens: '10', outputTokens: '20',
      cacheReadTokens: '0', cacheWriteTokens: '0', costUsd: '0.001',
      requestHash: 'bhash', upstreamRequestHash: 'buhash', auditMatch: true,
    })

    // User A (token) tries to access B's log → 404
    const r = await req(`/api/console/logs/${logIdB}`)
    expect(r.status).toBe(404)
  })
})
