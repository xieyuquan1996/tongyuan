import { Hono } from 'hono'
import { AppError, toErrorBody } from './shared/errors.js'
import { authRoutes } from './routes/console/auth.js'
import { keysRoutes } from './routes/console/keys.js'
import { upstreamKeysRoutes } from './routes/admin/upstream-keys.js'

export function createApp() {
  const app = new Hono()

  app.onError((err, c) => {
    const e = err as any
    const status: number =
      err instanceof AppError ? err.status :
      (e && typeof e.status === 'number' && typeof e.code === 'string') ? e.status :
      500
    const body = toErrorBody(err)
    return c.json(body, status as any)
  })

  app.get('/healthz', (c) => c.json({ ok: true }))
  app.route('/api/console', authRoutes)
  app.route('/api/console/keys', keysRoutes)
  app.route('/api/admin/upstream-keys', upstreamKeysRoutes)
  app.notFound((c) => c.json({ error: 'route_not_found' }, 404))
  return app
}
