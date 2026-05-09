import { describe, it, expect } from 'vitest'
import { renderErrorRate } from './alert-error-rate.js'

describe('renderErrorRate', () => {
  const data = { errorRate: 0.75, threshold: 0.5, triggeredAt: new Date('2026-05-09T10:00:00Z') }

  it('returns correct subject', () => {
    const { subject } = renderErrorRate(data)
    expect(subject).toBe('请求错误率告警')
  })

  it('html contains formatted error rate percentage', () => {
    const { html } = renderErrorRate(data)
    expect(html).toContain('75.0%')
  })

  it('html contains formatted threshold percentage', () => {
    const { html } = renderErrorRate(data)
    expect(html).toContain('50.0%')
  })

  it('html uses amber color (error_rate = amber category)', () => {
    const { html } = renderErrorRate(data)
    expect(html).toContain('#f59e0b')
  })

  it('text fallback contains rate and threshold', () => {
    const { text } = renderErrorRate(data)
    expect(text).toContain('75.0%')
    expect(text).toContain('50.0%')
  })

  it('html is wrapped in layout', () => {
    const { html } = renderErrorRate(data)
    expect(html).toContain('此邮件由系统自动发送')
  })
})
