import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../../app.js'
import { db, pool } from '../../db/client.js'
import { models } from '../../db/schema.js'

const app = createApp()
async function get(path: string) { return app.fetch(new Request('http://x' + path)) }

beforeAll(async () => {
  // Ensure at least one enabled model exists for /models
  await db.insert(models).values({
    id: 'public-test-model',
    displayName: 'Public Test',
    inputPriceUsdPerMtok: '3',
    outputPriceUsdPerMtok: '15',
    contextWindow: '200000',
    enabled: true,
  }).onConflictDoNothing()
})
afterAll(async () => { await pool.end() })

describe('public endpoints', () => {
  it('stats shape', async () => {
    const r = await get('/api/public/stats')
    expect(r.status).toBe(200)
    const j = await r.json() as any
    expect(j.uptime_30d).toMatch(/%$/)
    expect(j.region).toBeDefined()
  })

  it('regions list', async () => {
    const r = await get('/api/public/regions')
    const j = await r.json() as any
    expect(Array.isArray(j.regions)).toBe(true)
    expect(j.regions.length).toBeGreaterThan(0)
    expect(j.regions[0].status).toMatch(/ok|warn|down/)
  })

  it('models joins db', async () => {
    const r = await get('/api/public/models')
    const j = await r.json() as any
    expect(j.models.some((m: any) => m.id === 'public-test-model')).toBe(true)
    const row = j.models.find((m: any) => m.id === 'public-test-model')
    expect(row.price).toBe('$3 / $15')
    expect(row.context).toBe('200k')
  })

  it('plans list', async () => {
    const r = await get('/api/public/plans')
    const j = await r.json() as any
    expect(j.plans.length).toBeGreaterThan(0)
    expect(j.plans[0].name).toBeDefined()
  })

  it('status merged with regions + incidents', async () => {
    const r = await get('/api/public/status')
    const j = await r.json() as any
    expect(j.overall).toBeDefined()
    expect(Array.isArray(j.regions)).toBe(true)
    expect(Array.isArray(j.incidents)).toBe(true)
    expect(Array.isArray(j.components)).toBe(true)
  })

  it('changelog entries', async () => {
    const r = await get('/api/public/changelog')
    const j = await r.json() as any
    expect(Array.isArray(j.entries)).toBe(true)
    expect(j.entries[0].tag).toMatch(/feature|improvement|fix/)
  })
})
