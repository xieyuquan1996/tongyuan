import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users, alerts, billingLedger } from '../db/schema.js'
import { redis } from '../redis/client.js'
import { getMailer } from './mailer/index.js'
import { renderAlertEmail } from './email-templates/index.js'

export function checkBillingAlerts(userId: string): void {
  _checkBilling(userId).catch((err) =>
    console.warn('[alert-notifier] billing check failed', err),
  )
}

export function checkRequestAlerts(userId: string, metrics: { errorRate: number; p99Ms: number }): void {
  _checkRequest(userId, metrics).catch((err) =>
    console.warn('[alert-notifier] request check failed', err),
  )
}

async function _checkBilling(userId: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user?.notifyEmail) return

  const userAlerts = await db.select().from(alerts).where(
    and(eq(alerts.userId, userId), eq(alerts.enabled, true), eq(alerts.channel, 'email')),
  )
  const relevant = userAlerts.filter(a => a.kind === 'balance_low' || a.kind === 'spend_daily')
  if (!relevant.length) return

  let dailySpendUsd: number | null = null

  for (const alert of relevant) {
    const cooldownKey = `alert_sent:${alert.id}`
    if (await redis.get(cooldownKey)) continue

    let shouldFire = false
    const threshold = Number(alert.threshold)

    if (alert.kind === 'balance_low') {
      const balance = Number(user.balanceUsd)
      if (balance < threshold) {
        shouldFire = true
      }
    } else if (alert.kind === 'spend_daily') {
      if (dailySpendUsd === null) {
        const dayStart = new Date()
        dayStart.setHours(0, 0, 0, 0)
        const [row] = await db.select({
          total: sql<string>`coalesce(sum(-amount_usd), 0)::text`,
        }).from(billingLedger).where(
          and(
            eq(billingLedger.userId, userId),
            eq(billingLedger.kind, 'debit_usage'),
            gte(billingLedger.createdAt, dayStart),
          ),
        )
        dailySpendUsd = Number(row!.total)
      }
      if (dailySpendUsd >= threshold) {
        shouldFire = true
      }
    }

    if (shouldFire) {
      let emailData: Record<string, unknown>
      if (alert.kind === 'balance_low') {
        emailData = { balance: Number(user.balanceUsd), threshold, triggeredAt: new Date() }
      } else {
        emailData = { dailySpend: dailySpendUsd!, threshold, triggeredAt: new Date() }
      }
      const { subject, html, text } = renderAlertEmail(alert.kind, emailData)
      await getMailer().send({ to: user.email, subject, text, html })
      await redis.set(cooldownKey, '1', 'EX', 3600)
    }
  }
}

async function _checkRequest(userId: string, metrics: { errorRate: number; p99Ms: number }): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user?.notifyEmail) return

  const userAlerts = await db.select().from(alerts).where(
    and(eq(alerts.userId, userId), eq(alerts.enabled, true), eq(alerts.channel, 'email')),
  )
  const relevant = userAlerts.filter(a => a.kind === 'error_rate' || a.kind === 'p99_latency')
  if (!relevant.length) return

  for (const alert of relevant) {
    const cooldownKey = `alert_sent:${alert.id}`
    if (await redis.get(cooldownKey)) continue

    let shouldFire = false
    const threshold = Number(alert.threshold)

    if (alert.kind === 'error_rate') {
      if (metrics.errorRate >= threshold) {
        shouldFire = true
      }
    } else if (alert.kind === 'p99_latency') {
      if (metrics.p99Ms >= threshold) {
        shouldFire = true
      }
    }

    if (shouldFire) {
      let emailData: Record<string, unknown>
      if (alert.kind === 'error_rate') {
        emailData = { errorRate: metrics.errorRate, threshold, triggeredAt: new Date() }
      } else {
        emailData = { p99Ms: metrics.p99Ms, threshold, triggeredAt: new Date() }
      }
      const { subject, html, text } = renderAlertEmail(alert.kind, emailData)
      await getMailer().send({ to: user.email, subject, text, html })
      await redis.set(cooldownKey, '1', 'EX', 3600)
    }
  }
}
