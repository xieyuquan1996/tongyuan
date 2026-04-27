// backend/src/routes/metrics.ts
import { Hono } from 'hono'
import { registry } from '../observability/metrics.js'
import { env } from '../env.js'
import { AppError } from '../shared/errors.js'

export const metricsRoutes = new Hono()

metricsRoutes.get('/', async (c) => {
  // If METRICS_TOKEN is set, require it. If unset, route is open (dev).
  if (env.METRICS_TOKEN) {
    const auth = c.req.header('authorization') ?? ''
    const expected = `Bearer ${env.METRICS_TOKEN}`
    if (auth !== expected) throw new AppError('unauthorized')
  }
  const body = await registry.metrics()
  return c.body(body, 200, { 'content-type': registry.contentType })
})
