import { describe, it, expect } from 'vitest'
import { renderAlertEmail } from './index.js'

describe('renderAlertEmail', () => {
  it('dispatches balance_low', () => {
    const { subject } = renderAlertEmail('balance_low', {
      balance: 1, threshold: 5, triggeredAt: new Date(),
    })
    expect(subject).toBe('余额不足提醒')
  })

  it('dispatches spend_daily', () => {
    const { subject } = renderAlertEmail('spend_daily', {
      dailySpend: 15, threshold: 10, triggeredAt: new Date(),
    })
    expect(subject).toBe('日消费超限提醒')
  })

  it('dispatches error_rate', () => {
    const { subject } = renderAlertEmail('error_rate', {
      errorRate: 0.8, threshold: 0.5, triggeredAt: new Date(),
    })
    expect(subject).toBe('请求错误率告警')
  })

  it('dispatches p99_latency', () => {
    const { subject } = renderAlertEmail('p99_latency', {
      p99Ms: 2000, threshold: 1000, triggeredAt: new Date(),
    })
    expect(subject).toBe('P99 延迟告警')
  })

  it('throws on unknown kind', () => {
    expect(() => renderAlertEmail('unknown_kind', {})).toThrow('Unknown alert kind')
  })

  it('result always has subject, html, text', () => {
    const result = renderAlertEmail('balance_low', {
      balance: 1, threshold: 5, triggeredAt: new Date(),
    })
    expect(result).toHaveProperty('subject')
    expect(result).toHaveProperty('html')
    expect(result).toHaveProperty('text')
  })
})
