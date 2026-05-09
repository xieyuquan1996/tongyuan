import { describe, it, expect } from 'vitest'
import { renderSpendDaily } from './alert-spend-daily.js'

describe('renderSpendDaily', () => {
  const data = { dailySpend: 15.0, threshold: 10.0, triggeredAt: new Date('2026-05-09T10:00:00Z') }

  it('returns correct subject', () => {
    const { subject } = renderSpendDaily(data)
    expect(subject).toBe('日消费超限提醒')
  })

  it('html contains daily spend', () => {
    const { html } = renderSpendDaily(data)
    expect(html).toContain('15.0000')
  })

  it('html contains threshold', () => {
    const { html } = renderSpendDaily(data)
    expect(html).toContain('10.0000')
  })

  it('html uses red color (spend_daily = red category)', () => {
    const { html } = renderSpendDaily(data)
    expect(html).toContain('#ef4444')
  })

  it('text fallback contains spend and threshold', () => {
    const { text } = renderSpendDaily(data)
    expect(text).toContain('15.0000')
    expect(text).toContain('10.0000')
  })

  it('html is wrapped in layout', () => {
    const { html } = renderSpendDaily(data)
    expect(html).toContain('此邮件由系统自动发送')
  })
})
