import { Hono } from 'hono'
import { AppError, toErrorBody } from './shared/errors.js'
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
import { v1Models } from './routes/v1/models.js'
import { v1Messages } from './routes/v1/messages.js'
import { v1CountTokens } from './routes/v1/count-tokens.js'
import { v1ChatCompletions } from './routes/v1/chat-completions.js'
import { overviewRoutes } from './routes/console/overview.js'
import { logsRoutes } from './routes/console/logs.js'
import { billingRoutes, invoicesRoutes, rechargesRoutes, rechargeRoutes } from './routes/console/billing.js'
import { alertsRoutes } from './routes/console/alerts.js'
import { playgroundRoutes } from './routes/console/playground.js'
import { metricsRoutes } from './routes/metrics.js'
import { publicStats } from './routes/public/stats.js'
import { publicRegions } from './routes/public/regions.js'
import { publicModels } from './routes/public/models.js'
import { publicPlans } from './routes/public/plans.js'
import { publicStatus } from './routes/public/status.js'
import { publicChangelog } from './routes/public/changelog.js'
import { publicAnnouncements } from './routes/public/announcements.js'
import { analyticsRoutes } from './routes/console/analytics.js'
import { installRoutes } from './routes/install.js'

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
  app.route('/v1/models', v1Models)
  app.route('/v1/messages', v1Messages)
  app.route('/v1/messages/count_tokens', v1CountTokens)
  app.route('/v1/chat/completions', v1ChatCompletions)
  app.route('/api/public/stats', publicStats)
  app.route('/api/public/regions', publicRegions)
  app.route('/api/public/models', publicModels)
  app.route('/api/public/plans', publicPlans)
  app.route('/api/public/status', publicStatus)
  app.route('/api/public/changelog', publicChangelog)
  app.route('/api/public/announcements', publicAnnouncements)
  app.route('/api', installRoutes)
  app.notFound((c) => c.json({ error: 'route_not_found' }, 404))
  return app
}
