// backend/src/routes/admin/announcements.ts
import { Hono } from 'hono'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import { AppError } from '../../shared/errors.js'

export const adminAnnouncementsRoutes = new Hono()
adminAnnouncementsRoutes.use('*', requireBearer, requireAdmin)

const CONFIG_PATH = resolve(process.cwd(), 'config/public.json')

adminAnnouncementsRoutes.get('/', async (c) => {
  const raw = await readFile(CONFIG_PATH, 'utf-8')
  const cfg = JSON.parse(raw)
  const changelog = cfg.changelog ?? []
  const announcements = changelog.map((e: any, idx: number) => ({
    id: `ann_${idx}`,
    title: e.title,
    body: e.body,
    severity: e.tag === 'feature' ? 'info' : e.tag === 'warn' ? 'warn' : e.tag === 'incident' ? 'err' : 'info',
    pinned: idx === 0,
    visible: true,
    created_at: e.date,
  }))
  return c.json({ announcements })
})

const NOT_IMPL_MSG = 'Edit config/public.json and restart'
adminAnnouncementsRoutes.post('/', () => { throw new AppError('not_implemented', NOT_IMPL_MSG) })
adminAnnouncementsRoutes.patch('/:id', () => { throw new AppError('not_implemented', NOT_IMPL_MSG) })
adminAnnouncementsRoutes.delete('/:id', () => { throw new AppError('not_implemented', NOT_IMPL_MSG) })
