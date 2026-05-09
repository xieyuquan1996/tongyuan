import { describe, it, expect } from 'vitest'
import { renderResetPassword } from './reset-password.js'

describe('renderResetPassword', () => {
  const data = { resetLink: 'http://localhost:5173/reset-password?token=abc123' }

  it('returns correct subject', () => {
    const { subject } = renderResetPassword(data)
    expect(subject).toBe('密码重置链接')
  })

  it('html contains the reset link', () => {
    const { html } = renderResetPassword(data)
    expect(html).toContain('http://localhost:5173/reset-password?token=abc123')
  })

  it('html mentions 1-hour validity', () => {
    const { html } = renderResetPassword(data)
    expect(html).toContain('1小时')
  })

  it('html is wrapped in layout (has footer)', () => {
    const { html } = renderResetPassword(data)
    expect(html).toContain('此邮件由系统自动发送')
  })

  it('text fallback contains the reset link', () => {
    const { text } = renderResetPassword(data)
    expect(text).toContain('http://localhost:5173/reset-password?token=abc123')
  })

  it('html has a prominent link/button for the reset action', () => {
    const { html } = renderResetPassword(data)
    // Should have an anchor tag pointing to the reset link
    expect(html).toContain('<a href="http://localhost:5173/reset-password?token=abc123"')
  })
})
