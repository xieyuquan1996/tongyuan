import { Hono } from 'hono'
import { AppError, RateLimitError, toErrorBody } from './shared/errors.js'
import { requestId } from './middleware/request-id.js'
import { authRoutes } from './routes/console/auth.js'
import { keysRoutes } from './routes/console/keys.js'
import { upstreamKeysRoutes } from './routes/admin/upstream-keys.js'
import { adminModelsRoutes } from './routes/admin/models.js'
import { adminOverviewRoutes } from './routes/admin/overview.js'
import { adminUsersRoutes } from './routes/admin/users.js'
import { adminLogsRoutes } from './routes/admin/logs.js'
import { adminBillingRoutes } from './routes/admin/billing.js'
import { adminRegionsRoutes } from './routes/admin/regions.js'
import { adminAnnouncementsRoutes } from './routes/admin/announcements.js'
import { adminAuditRoutes } from './routes/admin/audit.js'
import { adminKeysRoutes } from './routes/admin/keys.js'
import { adminSettingsRoutes } from './routes/admin/settings.js'
import { reconciliationRoutes } from './routes/admin/reconciliation.js'
import { v1Models } from './routes/v1/models.js'
import { v1Messages } from './routes/v1/messages.js'
import { v1CountTokens } from './routes/v1/count-tokens.js'
import { v1ChatCompletions } from './routes/v1/chat-completions.js'
import { v1Files } from './routes/v1/files.js'
import { overviewRoutes } from './routes/console/overview.js'
import { logsRoutes } from './routes/console/logs.js'
import { billingRoutes, invoicesRoutes, rechargesRoutes, rechargeRoutes } from './routes/console/billing.js'
import { alertsRoutes } from './routes/console/alerts.js'
import { webhooksRoutes } from './routes/console/webhooks.js'
import { playgroundRoutes } from './routes/console/playground.js'
import { metricsRoutes } from './routes/metrics.js'
import { publicStats } from './routes/public/stats.js'
import { publicRegions } from './routes/public/regions.js'
import { publicModels } from './routes/public/models.js'
import { publicPlans } from './routes/public/plans.js'
import { publicStatus } from './routes/public/status.js'
import { publicChangelog } from './routes/public/changelog.js'
import { publicAnnouncements } from './routes/public/announcements.js'
import { publicSite } from './routes/public/site.js'
import { analyticsRoutes } from './routes/console/analytics.js'
import { installRoutes } from './routes/install.js'

export function createApp() {
  const app = new Hono()

  // Security headers on every response including errors and 404s.
  app.use('*', (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    c.header('X-Permitted-Cross-Domain-Policies', 'none')
    if (process.env.NODE_ENV === 'production') {
      c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
    }
    return next()
  })

  // Top-level: stamp every response with x-request-id so support requests
  // and log lines line up. Runs before onError so error responses also
  // carry the id.
  app.use('*', requestId)

  app.onError((err, c) => {
    // RateLimitError emits the Anthropic SDK envelope with Retry-After headers.
    // Plain AppError('rate_limit') still uses toErrorBody() below — this split
    // resolves once rate-limit.ts and tpm-limit.ts migrate to RateLimitError.
    if (err instanceof RateLimitError) {
      return c.json(
        { type: 'error', error: { type: 'rate_limit_error', message: err.message } },
        429,
        err.rateLimitHeaders,
      )
    }
    const e = err as any
    const status: number =
      err instanceof AppError ? err.status :
      (e && typeof e.status === 'number' && typeof e.code === 'string') ? e.status :
      500
    return c.json(toErrorBody(err), status as any)
  })

  app.get('/healthz', (c) => c.json({ ok: true }))
  app.route('/metrics', metricsRoutes)
  app.route('/api/console', authRoutes)
  app.route('/api/console/keys', keysRoutes)
  app.route('/api/console/overview', overviewRoutes)
  app.route('/api/console/logs', logsRoutes)
  app.route('/api/console/billing', billingRoutes)
  app.route('/api/console/invoices', invoicesRoutes)
  app.route('/api/console/recharges', rechargesRoutes)
  app.route('/api/console/recharge', rechargeRoutes)
  app.route('/api/console/alerts', alertsRoutes)
  app.route('/api/console/webhooks', webhooksRoutes)
  app.route('/api/console/playground', playgroundRoutes)
  app.route('/api/console/analytics', analyticsRoutes)
  app.route('/api/admin/upstream-keys', upstreamKeysRoutes)
  app.route('/api/admin/models', adminModelsRoutes)
  app.route('/api/admin/overview', adminOverviewRoutes)
  app.route('/api/admin/users', adminUsersRoutes)
  app.route('/api/admin/logs', adminLogsRoutes)
  app.route('/api/admin/billing', adminBillingRoutes)
  app.route('/api/admin/regions', adminRegionsRoutes)
  app.route('/api/admin/announcements', adminAnnouncementsRoutes)
  app.route('/api/admin/audit', adminAuditRoutes)
  app.route('/api/admin/keys', adminKeysRoutes)
  app.route('/api/admin/settings', adminSettingsRoutes)
  app.route('/api/admin/reconciliation', reconciliationRoutes)
  app.route('/v1/models', v1Models)
  // count_tokens must be registered BEFORE /v1/messages so Hono's sub-router
  // prefix matching doesn't run v1Messages middleware on count_tokens requests.
  app.route('/v1/messages/count_tokens', v1CountTokens)
  app.route('/v1/messages', v1Messages)
  app.route('/v1/chat/completions', v1ChatCompletions)
  app.route('/v1/files', v1Files)
  app.route('/api/public/stats', publicStats)
  app.route('/api/public/regions', publicRegions)
  app.route('/api/public/models', publicModels)
  app.route('/api/public/plans', publicPlans)
  app.route('/api/public/status', publicStatus)
  app.route('/api/public/changelog', publicChangelog)
  app.route('/api/public/announcements', publicAnnouncements)
  app.route('/api/public/site', publicSite)
  app.route('/api', installRoutes)
  app.notFound((c) => c.json({ error: 'route_not_found' }, 404))
  return app
}
