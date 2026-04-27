// backend/src/routes/console/overview.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../../app.js'
import { pool, db } from '../../db/client.js'
import { requestLogs } from '../../db/schema.js'

const app = createApp()
let token = ''
let userId = ''
let apiKeyId = ''

beforeAll(async () => {
  const email = `overview-test-${Date.now()}@example.com`
  await pool.query(`DELETE FROM users WHERE email LIKE 'overview-test-%'`)
  const r = await app.fetch(new Request('http://x/api/console/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', name: 'T' }),
  }))
  const j = await r.json()
  token = j.session.token
  userId = j.user.id

  // create an api key to satisfy FK
  const kr = await app.fetch(new Request('http://x/api/console/keys', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'test-key' }),
  }))
  const kj = await kr.json()
  apiKeyId = kj.id

  // insert 3 request_logs directly
  await db.insert(requestLogs).values([
    {
      id: `req_test_ov_1_${Date.now()}`,
      userId, apiKeyId,
      model: 'claude-3-5-sonnet-20241022', upstreamModel: 'claude-3-5-sonnet-20241022',
      endpoint: '/v1/messages', stream: false, status: '200',
      latencyMs: '100', inputTokens: '10', outputTokens: '20',
      cacheReadTokens: '0', cacheWriteTokens: '0', costUsd: '0.001',
      requestHash: 'hash1', upstreamRequestHash: 'uhash1', auditMatch: true,
    },
    {
      id: `req_test_ov_2_${Date.now() + 1}`,
      userId, apiKeyId,
      model: 'claude-3-5-sonnet-20241022', upstreamModel: 'claude-3-5-sonnet-20241022',
      endpoint: '/v1/messages', stream: false, status: '200',
      latencyMs: '200', inputTokens: '15', outputTokens: '25',
      cacheReadTokens: '0', cacheWriteTokens: '0', costUsd: '0.002',
      requestHash: 'hash2', upstreamRequestHash: 'uhash2', auditMatch: true,
    },
    {
      id: `req_test_ov_3_${Date.now() + 2}`,
      userId, apiKeyId,
      model: 'claude-3-5-sonnet-20241022', upstreamModel: 'claude-3-5-sonnet-20241022',
      endpoint: '/v1/messages', stream: false, status: '500',
      latencyMs: '300', inputTokens: '5', outputTokens: '0',
      cacheReadTokens: '0', cacheWriteTokens: '0', costUsd: '0.000',
      requestHash: 'hash3', upstreamRequestHash: 'uhash3', auditMatch: false,
    },
  ])
})

afterAll(async () => { await pool.end() })

async function get(path: string) {
  return app.fetch(new Request('http://x' + path, {
    headers: { authorization: `Bearer ${token}` },
  }))
}

describe('overview routes', () => {
  it('returns aggregated metrics', async () => {
    const r = await get('/api/console/overview')
    expect(r.status).toBe(200)
    const j = await r.json()

    expect(j.metrics.requests_30d).toBe('3')
    expect(j.latency_series).toHaveLength(3)
    expect(j.recent_requests).toHaveLength(3)
    expect(j.metrics.uptime_30d).toMatch(/^\d+\.\d+%$/)
  })
})
