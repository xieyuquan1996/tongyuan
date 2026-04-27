import { Hono } from 'hono'
import { errorMiddleware } from './middleware/error.js'

export function createApp() {
  const app = new Hono()
  app.use('*', errorMiddleware)
  app.get('/healthz', (c) => c.json({ ok: true }))
  app.notFound((c) => c.json({ error: 'route_not_found' }, 404))
  return app
}
