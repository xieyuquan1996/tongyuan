// backend/src/routes/console/billing.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../../app.js'
import { pool } from '../../db/client.js'
import { invalidateRateCache } from '../../shared/fx.js'

const app = createApp()
let token = ''

beforeAll(async () => {
  // Pin the FX rate so the dual-currency assertion below is deterministic
  // regardless of what the operator has set in `settings`. We restore it
  // (or leave it pinned at 7.20, which is the documented default) at the
  // end of the suite. The 60-second TTL on the in-process cache means we
  // also have to invalidate it explicitly so the next read sees our value.
  await pool.query(`INSERT INTO settings (key, value) VALUES ('usd_to_cny', '7.20')
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`)
  invalidateRateCache()

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
  it('GET /billing returns plan and dual-currency balance', async () => {
    const r = await req('/api/console/billing')
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.plan).toBe('Starter')
    expect(j.billing.balance_usd).toBe('10.000000')
    expect(j.billing.balance_cny).toBe('72.000000')
    expect(j.billing.used_usd).toBe('0.000000')
    expect(j.billing.used_cny).toBe('0.000000')
    expect(j.billing.balance.startsWith('¥')).toBe(true)
    expect(j.billing.used.startsWith('¥')).toBe(true)
  })

  it('POST /recharge returns 501', async () => {
    const r = await req('/api/console/recharge', { method: 'POST', body: JSON.stringify({}) })
    expect(r.status).toBe(501)
  })
})
