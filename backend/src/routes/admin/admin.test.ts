// backend/src/routes/admin/admin.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../../app.js'
import { pool } from '../../db/client.js'

const app = createApp()
let token = ''

beforeAll(async () => {
  const email = `admin-test-${Date.now()}@example.com`
  await pool.query(`DELETE FROM users WHERE email LIKE 'admin-test-%'`)
  const r = await app.fetch(new Request('http://x/api/console/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123', name: 'A' }),
  }))
  const j = await r.json()
  token = j.session.token
  // Promote to admin
  await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [j.user.id])
})

afterAll(async () => { await pool.end() })

async function get(path: string) {
  return app.fetch(new Request('http://x' + path, {
    headers: { authorization: `Bearer ${token}` },
  }))
}

describe('admin read endpoints smoke', () => {
  for (const p of ['overview', 'users', 'logs', 'billing', 'regions', 'announcements', 'audit', 'settings']) {
    it(`GET /api/admin/${p} returns 200`, async () => {
      const r = await get(`/api/admin/${p}`)
      expect(r.status).toBe(200)
      const body = await r.json()
      expect(body).toBeDefined()
    })
  }

  it('GET /api/admin/settings returns exchange rate', async () => {
    const r = await get('/api/admin/settings')
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(typeof body.usd_to_cny).toBe('number')
    expect(body.usd_to_cny).toBeGreaterThan(0)
  })

  it('PUT /api/admin/settings updates exchange rate', async () => {
    const app2 = createApp()
    const r = await app2.fetch(new Request('http://x/api/admin/settings', {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ usd_to_cny: 7.35 }),
    }))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.ok).toBe(true)
    expect(body.usd_to_cny).toBe(7.35)

    // Verify it persisted
    const r2 = await get('/api/admin/settings')
    const body2 = await r2.json()
    expect(body2.usd_to_cny).toBe(7.35)
  })

  it('rejects non-admin with 403', async () => {
    const r = await app.fetch(new Request('http://x/api/console/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `admin-test-nonadmin-${Date.now()}@example.com`, password: 'secret123', name: 'N' }),
    }))
    const j = await r.json()
    const r2 = await app.fetch(new Request('http://x/api/admin/overview', {
      headers: { authorization: `Bearer ${j.session.token}` },
    }))
    expect(r2.status).toBe(403)
  })
})
