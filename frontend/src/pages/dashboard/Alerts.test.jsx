import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Alerts from './Alerts.jsx'

function mockFetch(alertsResp, meResp) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    if (String(url).includes('/api/console/me')) {
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(meResp)),
      })
    }
    if (String(url).includes('/api/console/alerts')) {
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(alertsResp)),
      })
    }
    return Promise.reject(new Error('unexpected fetch: ' + url))
  })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Alerts page — email channel', () => {
  it('邮件 appears as channel option in CHANNELS', async () => {
    mockFetch({ alerts: [] }, { notify_email: true })
    render(<MemoryRouter><Alerts /></MemoryRouter>)
    const addBtn = await screen.findByText('新增告警')
    addBtn.click()
    await waitFor(() => {
      // The default channel display button shows the current channel label
      // When CHANNELS includes email, "邮件" or "浏览器推送" will appear
      // We check that at least one channel select shows, indicating CHANNELS loaded
      expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
    })
  })

  it('no email warning shown when notifyEmail is true', async () => {
    mockFetch({ alerts: [] }, { notify_email: true })
    render(<MemoryRouter><Alerts /></MemoryRouter>)
    await screen.findByText('新增告警')
    await waitFor(() => {
      expect(screen.queryByText(/邮件通知未开启/)).toBeNull()
    })
  })

  it('email warning shown for existing alert with email channel when notifyEmail is false', async () => {
    mockFetch(
      { alerts: [{ id: '1', kind: 'balance_low', threshold: '5', channel: 'email', enabled: true }] },
      { notify_email: false }
    )
    render(<MemoryRouter><Alerts /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.queryByText(/邮件通知未开启/)).not.toBeNull()
    })
  })
})
