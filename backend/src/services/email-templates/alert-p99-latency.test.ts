import { describe, it, expect } from 'vitest'
import { renderP99Latency } from './alert-p99-latency.js'

describe('renderP99Latency', () => {
  const data = { p99Ms: 2000, threshold: 1000, triggeredAt: new Date('2026-05-09T10:00:00Z') }

  it('returns correct subject', () => {
    const { subject } = renderP99Latency(data)
    expect(subject).toBe('P99 延迟告警')
  })

  it('html contains current p99Ms', () => {
    const { html } = renderP99Latency(data)
    expect(html).toContain('2000ms')
  })

  it('html contains threshold ms', () => {
    const { html } = renderP99Latency(data)
    expect(html).toContain('1000ms')
  })

  it('html uses amber color (p99_latency = amber category)', () => {
    const { html } = renderP99Latency(data)
    expect(html).toContain('#f59e0b')
  })

  it('text fallback contains values', () => {
    const { text } = renderP99Latency(data)
    expect(text).toContain('2000ms')
    expect(text).toContain('1000ms')
  })

  it('html is wrapped in layout', () => {
    const { html } = renderP99Latency(data)
    expect(html).toContain('此邮件由系统自动发送')
  })
})
