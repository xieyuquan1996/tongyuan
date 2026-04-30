// backend/src/observability/metrics.ts
import { Counter, Histogram, Gauge, register } from 'prom-client'

export const registry = register

export const gatewayRequests = new Counter({
  name: 'gateway_requests_total',
  help: 'Gateway requests by model and status',
  labelNames: ['model', 'status'],
})

export const gatewayLatency = new Histogram({
  name: 'gateway_latency_ms',
  help: 'Gateway latency in milliseconds',
  labelNames: ['model', 'phase'], // phase: 'ttfb' | 'total'
  buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000, 30000],
})

// TODO: wire upstream_state gauge from upstream-keys state transitions
// (markCooldown / create / reactivateExpired). Left out for MVP.
export const upstreamState = new Gauge({
  name: 'upstream_state',
  help: 'Upstream key state (1=active, 0=cooldown/disabled)',
  labelNames: ['upstream_key_id', 'state'],
})

export const billingUsdConsumed = new Counter({
  name: 'billing_usd_consumed_total',
  help: 'Total USD consumed by model',
  labelNames: ['model'],
})

// Current-window usage against per-family Anthropic budgets. Populated lazily
// when admins hit the quota snapshot endpoint, or on a periodic scrape.
export const upstreamQuotaUsed = new Gauge({
  name: 'upstream_quota_used',
  help: 'Current-minute upstream usage against Anthropic per-family budget',
  labelNames: ['upstream_key_id', 'family', 'metric'], // metric: 'req' | 'in' | 'out'
})

// Separate gauge for the ceiling so dashboards can plot used/total.
export const upstreamQuotaBudget = new Gauge({
  name: 'upstream_quota_budget',
  help: 'Per-family Anthropic budget (rpm/itpm/otpm)',
  labelNames: ['upstream_key_id', 'family', 'metric'],
})

// 1 when a key×family is parked due to 429, 0 otherwise.
export const upstreamFamilyCooldown = new Gauge({
  name: 'upstream_family_cooldown',
  help: 'Upstream key × family is in quota cooldown (1=yes)',
  labelNames: ['upstream_key_id', 'family'],
})
