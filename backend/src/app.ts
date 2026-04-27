import { Hono } from 'hono'
import { errorMiddleware } from './middleware/error.js'

export function createApp() {
  const app = new Hono()
  app.use('*', errorMiddleware)
  app.get('/healthz', (c) => c.json({ ok: true }))
  return app
}
