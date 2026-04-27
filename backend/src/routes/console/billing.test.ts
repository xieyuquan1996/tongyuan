// backend/src/routes/console/billing.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../../app.js'
import { pool } from '../../db/client.js'

const app = createApp()
let token = ''

beforeAll(async () => {
  const email = `billing-test-${Date.now()}@example.com`
  await pool.query(`DELETE FROM users WHERE email LIKE 'billing-test-%'`)
  const r = await app.fetch(new Request('http://x/api/console/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', name: 'T' }),
  }))
  token = (await r.json()).session.token
})

afterAll(async () => { await pool.end() })

async function req(path: string, init: RequestInit = {}) {
  return app.fetch(new Request('http://x' + path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers as any) },
  }))
}

describe('billing routes', () => {
  it('GET /billing returns plan and balance', async () => {
    const r = await req('/api/console/billing')
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.plan).toBe('Starter')
    expect(j.billing.balance_usd).toBe('10.000000')
    expect(j.billing.balance).toBe('$10.00')
  })

  it('POST /recharge returns 501', async () => {
    const r = await req('/api/console/recharge', { method: 'POST', body: JSON.stringify({}) })
    expect(r.status).toBe(501)
  })
})
