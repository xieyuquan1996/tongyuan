import { describe, it, expect } from 'vitest'
import { renderBalanceLow } from './alert-balance-low.js'

describe('renderBalanceLow', () => {
  const data = { balance: 2.5, threshold: 5.0, triggeredAt: new Date('2026-05-09T10:00:00Z') }

  it('returns correct subject', () => {
    const { subject } = renderBalanceLow(data)
    expect(subject).toBe('余额不足提醒')
  })

  it('html contains current balance', () => {
    const { html } = renderBalanceLow(data)
    expect(html).toContain('2.5000')
  })

  it('html contains threshold', () => {
    const { html } = renderBalanceLow(data)
    expect(html).toContain('5.0000')
  })

  it('html uses red color for balance_low/spend_daily category', () => {
    const { html } = renderBalanceLow(data)
    expect(html).toContain('#ef4444')
  })

  it('text fallback contains balance and threshold', () => {
    const { text } = renderBalanceLow(data)
    expect(text).toContain('2.5000')
    expect(text).toContain('5.0000')
  })

  it('html is wrapped in layout (has footer)', () => {
    const { html } = renderBalanceLow(data)
    expect(html).toContain('此邮件由系统自动发送')
  })
})
