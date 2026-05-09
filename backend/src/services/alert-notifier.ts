import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users, alerts, billingLedger } from '../db/schema.js'
import { redis } from '../redis/client.js'
import { getMailer } from './mailer/index.js'

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
    let subject = ''
    let text = ''
    const threshold = Number(alert.threshold)

    if (alert.kind === 'balance_low') {
      const balance = Number(user.balanceUsd)
      if (balance < threshold) {
        shouldFire = true
        subject = '余额不足提醒'
        text = `您的账户余额（$${balance.toFixed(4)}）已低于设定阈值 $${threshold.toFixed(4)}，请及时充值。`
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
        subject = '日消费超限提醒'
        text = `您今日消费（$${dailySpendUsd.toFixed(4)}）已达到设定阈值 $${threshold.toFixed(4)}。`
      }
    }

    if (shouldFire) {
      await getMailer().send({ to: user.email, subject, text })
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
    let subject = ''
    let text = ''
    const threshold = Number(alert.threshold)

    if (alert.kind === 'error_rate') {
      if (metrics.errorRate >= threshold) {
        shouldFire = true
        subject = '请求错误率告警'
        text = `本次请求错误率（${(metrics.errorRate * 100).toFixed(1)}%）已超过设定阈值 ${(threshold * 100).toFixed(1)}%。`
      }
    } else if (alert.kind === 'p99_latency') {
      if (metrics.p99Ms >= threshold) {
        shouldFire = true
        subject = 'P99 延迟告警'
        text = `本次请求延迟（${metrics.p99Ms}ms）已超过设定阈值 ${threshold}ms。`
      }
    }

    if (shouldFire) {
      await getMailer().send({ to: user.email, subject, text })
      await redis.set(cooldownKey, '1', 'EX', 3600)
    }
  }
}
