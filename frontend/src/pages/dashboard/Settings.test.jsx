import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Outlet, Routes, Route } from 'react-router-dom'

vi.mock('../../lib/theme.jsx', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}))

import Settings from './Settings.jsx'

function makeUser(overrides = {}) {
  return {
    name: 'Test', email: 't@example.com', company: '', phone: '',
    notify_email: true, notify_browser: false,
    webhook_url: null, webhook_token: null,
    ...overrides,
  }
}

function renderSettings(user) {
  const Parent = () => <Outlet context={{ user }} />
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route element={<Parent />}>
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(JSON.stringify({})),
  })
})

afterEach(() => { vi.restoreAllMocks() })

describe('Settings — Webhook 配置区块', () => {
  it('显示 Webhook 通知区块标题', () => {
    renderSettings(makeUser())
    expect(screen.getByText('Webhook 通知')).toBeTruthy()
  })

  it('初始无 webhook_url 时输入框为空', () => {
    renderSettings(makeUser({ webhook_url: null }))
    const input = screen.getByPlaceholderText(/https:\/\/your-service/)
    expect(input.value).toBe('')
  })

  it('已配置 webhook_url 时输入框显示该值', () => {
    renderSettings(makeUser({ webhook_url: 'https://hook.example.com' }))
    const input = screen.getByPlaceholderText(/https:\/\/your-service/)
    expect(input.value).toBe('https://hook.example.com')
  })

  it('token 已配置时 input placeholder 包含"已配置"', () => {
    renderSettings(makeUser({ webhook_token: '••••••••' }))
    const tokenInput = screen.getByPlaceholderText(/已配置/)
    expect(tokenInput).toBeTruthy()
  })

  it('点击发送测试按钮时调用 /api/console/webhooks/test', async () => {
    renderSettings(makeUser({ webhook_url: 'https://hook.example.com' }))
    fireEvent.click(screen.getByText('发送测试'))
    await waitFor(() => {
      const calls = vi.mocked(globalThis.fetch).mock.calls
      expect(calls.some(([url]) => String(url).includes('/api/console/webhooks/test'))).toBe(true)
    })
  })
})
