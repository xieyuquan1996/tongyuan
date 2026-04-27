// backend/src/routes/v1/messages.failover.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../../app.js'
import { db, pool } from '../../db/client.js'
import { users, apiKeys, requestLogs } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

const app = createApp()

let userId: string
let apiKeySecret: string

beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email='failover-test@example.com'")
  const [u] = await db.insert(users).values({
    email: 'failover-test@example.com',
    passwordHash: 'x',
    name: 'failover',
    balanceUsd: '10.000000',
  }).returning()
  userId = u!.id

  // Insert a model so the route doesn't 400 before reaching forwardNonStream
  await pool.query(`
    INSERT INTO models (id, display_name, enabled)
    VALUES ('claude-opus-4-7', 'Claude Opus 4.7', true)
    ON CONFLICT (id) DO NOTHING
  `)

  // Create a real-looking api key (prefix must be 16 chars starting with sk-relay-)
  apiKeySecret = 'sk-relay-failovr-test-secret-key'
  const secretHash = await bcrypt.hash(apiKeySecret, 12)
  const prefix = apiKeySecret.slice(0, 16)
  await db.insert(apiKeys).values({
    userId,
    name: 'failover-key',
    prefix,
    secretHash,
    state: 'active',
  })
  // No upstream_keys inserted — pool is empty
})

afterAll(async () => { await pool.end() })

describe('messages failover', () => {
  it('returns 502 and writes a request_log row when all upstreams are down', async () => {
    const res = await app.fetch(new Request('http://localhost/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKeySecret,
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 10,
      }),
    }))

    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toBe('all_upstreams_down')

    const logs = await db.select().from(requestLogs).where(eq(requestLogs.userId, userId))
    expect(logs).toHaveLength(1)
    expect(Number(logs[0]!.status)).toBe(502)
    expect(logs[0]!.errorCode).toBe('all_upstreams_down')
  })
})
