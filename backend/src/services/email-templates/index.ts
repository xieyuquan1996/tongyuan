import { renderBalanceLow } from './alert-balance-low.js'
import { renderSpendDaily } from './alert-spend-daily.js'
import { renderErrorRate } from './alert-error-rate.js'
import { renderP99Latency } from './alert-p99-latency.js'

export function renderAlertEmail(
  kind: string,
  data: Record<string, unknown>,
): { subject: string; html: string; text: string } {
  switch (kind) {
    case 'balance_low':
      return renderBalanceLow(data as Parameters<typeof renderBalanceLow>[0])
    case 'spend_daily':
      return renderSpendDaily(data as Parameters<typeof renderSpendDaily>[0])
    case 'error_rate':
      return renderErrorRate(data as Parameters<typeof renderErrorRate>[0])
    case 'p99_latency':
      return renderP99Latency(data as Parameters<typeof renderP99Latency>[0])
    default:
      throw new Error(`Unknown alert kind: ${kind}`)
  }
}
