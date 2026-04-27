// backend/src/routes/console/alerts.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../../app.js'
import { pool } from '../../db/client.js'

const app = createApp()
let token = ''

beforeAll(async () => {
  const email = `alerts-test-${Date.now()}@example.com`
  await pool.query(`DELETE FROM users WHERE email LIKE 'alerts-test-%'`)
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

describe('alerts routes', () => {
  let alertId = ''

  it('creates an alert', async () => {
    const r = await req('/api/console/alerts', {
      method: 'POST',
      body: JSON.stringify({ kind: 'balance_low', threshold: '5.00', channel: 'email', enabled: true }),
    })
    expect(r.status).toBe(201)
    const j = await r.json()
    expect(j.kind).toBe('balance_low')
    expect(j.threshold).toBe('5.00')
    alertId = j.id
  })

  it('lists alerts (expect 1)', async () => {
    const r = await req('/api/console/alerts')
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.alerts).toHaveLength(1)
    expect(j.alerts[0].id).toBe(alertId)
  })

  it('patches threshold', async () => {
    const r = await req(`/api/console/alerts/${alertId}`, {
      method: 'PATCH',
      body: JSON.stringify({ threshold: '3.00' }),
    })
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.threshold).toBe('3.00')
  })

  it('deletes alert', async () => {
    const r = await req(`/api/console/alerts/${alertId}`, { method: 'DELETE' })
    expect(r.status).toBe(200)
    expect((await r.json()).ok).toBe(true)
  })

  it('lists alerts (expect 0)', async () => {
    const r = await req('/api/console/alerts')
    const j = await r.json()
    expect(j.alerts).toHaveLength(0)
  })
})
