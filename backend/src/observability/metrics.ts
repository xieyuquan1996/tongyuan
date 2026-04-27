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
