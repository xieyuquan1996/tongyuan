import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
  it('邮件 appears as channel option when the channel select is opened', async () => {
    mockFetch({ alerts: [] }, { notify_email: true })
    render(<MemoryRouter><Alerts /></MemoryRouter>)

    // Open the new-alert form
    const addBtn = await screen.findByText('新增告警')
    fireEvent.click(addBtn)

    // Wait for the form to render — the default channel is "browser" so
    // the channel select button should show "浏览器推送"
    await waitFor(() => {
      expect(screen.getByText('浏览器推送')).toBeTruthy()
    })

    // Click the channel select button to open the dropdown
    const channelSelectBtn = screen.getByText('浏览器推送').closest('button')
    fireEvent.click(channelSelectBtn)

    // The dropdown options should now be visible — "邮件" must be one of them
    await waitFor(() => {
      expect(screen.getByText('邮件')).toBeTruthy()
    })
  })

  it('email banner shown in new-alert form when channel is email and notifyEmail is false', async () => {
    mockFetch({ alerts: [] }, { notify_email: false })
    render(<MemoryRouter><Alerts /></MemoryRouter>)

    // Open the new-alert form
    const addBtn = await screen.findByText('新增告警')
    fireEvent.click(addBtn)

    // Default channel is "browser" — no banner yet
    await waitFor(() => {
      expect(screen.getByText('浏览器推送')).toBeTruthy()
    })
    expect(screen.queryByText(/邮件通知未开启/)).toBeNull()

    // Open the channel dropdown and select "邮件"
    const channelSelectBtn = screen.getByText('浏览器推送').closest('button')
    fireEvent.click(channelSelectBtn)

    // Wait for the dropdown to render with the "邮件" option
    await waitFor(() => {
      expect(screen.getByText('邮件')).toBeTruthy()
    })

    // Click the "邮件" option
    const emailOption = screen.getByText('邮件')
    fireEvent.click(emailOption)

    // The EmailBanner should now appear because notifyEmail is false
    await waitFor(() => {
      expect(screen.queryByText(/邮件通知未开启/)).not.toBeNull()
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
