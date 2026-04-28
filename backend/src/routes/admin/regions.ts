// backend/src/routes/admin/regions.ts
import { Hono } from 'hono'
import { gte, sql } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import { db } from '../../db/client.js'
import { requestLogs } from '../../db/schema.js'

export const adminRegionsRoutes = new Hono()
adminRegionsRoutes.use('*', requireBearer, requireAdmin)

const CONFIG_PATH = resolve(process.cwd(), 'config/public.json')

async function loadConfig(): Promise<any> {
  const raw = await readFile(CONFIG_PATH, 'utf-8')
  return JSON.parse(raw)
}

adminRegionsRoutes.get('/', async (c) => {
  const cfg = await loadConfig()
  const since30d = new Date(Date.now() - 30 * 86_400_000)
  const [stats] = await db.select({
    count: sql<number>`count(*)::int`,
  }).from(requestLogs).where(gte(requestLogs.createdAt, since30d))

  const total = Number(stats!.count)
  const regions = (cfg.regions ?? []).map((r: any, idx: number) => ({
    ...r,
    // Attribute all traffic to the primary region (cn-east-1); others get 0
    request_count_30d: r.id === 'cn-east-1' ? total : 0,
  }))

  return c.json({
    regions,
    components: cfg.status?.components ?? [],
  })
})
