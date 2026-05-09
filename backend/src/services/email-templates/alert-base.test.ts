import { describe, it, expect } from 'vitest'
import { wrapLayout } from './alert-base.js'

describe('wrapLayout', () => {
  it('includes the title in the header', () => {
    const html = wrapLayout('Test Title', '<p>Body</p>')
    expect(html).toContain('Test Title')
  })

  it('includes the body html', () => {
    const html = wrapLayout('T', '<p id="test">hello</p>')
    expect(html).toContain('<p id="test">hello</p>')
  })

  it('includes the footer text', () => {
    const html = wrapLayout('T', '')
    expect(html).toContain('此邮件由系统自动发送')
  })

  it('includes link to alerts page in footer', () => {
    const html = wrapLayout('T', '')
    expect(html).toContain('/dashboard/alerts')
  })

  it('has gradient purple header', () => {
    const html = wrapLayout('T', '')
    expect(html).toContain('#667eea')
    expect(html).toContain('#764ba2')
  })
})
