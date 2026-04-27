// backend/src/gateway/scheduler.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { pool, db } from '../db/client.js'
import { upstreamKeys } from '../db/schema.js'
import { UpstreamScheduler } from './scheduler.js'
import * as svc from '../services/upstream-keys.js'

describe('UpstreamScheduler', () => {
  beforeEach(async () => { await db.delete(upstreamKeys) })

  it('picks active keys by priority asc', async () => {
    await svc.create({ alias: 'b', secret: 'sk-ant-api03-BBBBBBBB', priority: 200 })
    await svc.create({ alias: 'a', secret: 'sk-ant-api03-AAAAAAAA', priority: 100 })
    const s = new UpstreamScheduler()
    const list = await s.snapshot()
    expect(list[0]!.alias).toBe('a')
  })

  it('cooldown removes from active pool', async () => {
    const a = await svc.create({ alias: 'a', secret: 'sk-ant-api03-AAAAAAAA', priority: 100 })
    const s = new UpstreamScheduler()
    await s.cooldown(a.id, 60_000, 'rate_limit_429')
    const list = await s.snapshot()
    expect(list).toHaveLength(0)
  })
})
