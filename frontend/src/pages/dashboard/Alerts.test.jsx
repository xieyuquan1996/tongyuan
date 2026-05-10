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

    // Open the new-alert form
    const addBtn = await screen.findByText('新增告警')
    fireEvent.click(addBtn)

    // Wait for the form to render with the default channel button
    await waitFor(() => {
      expect(screen.getByText('浏览器推送')).toBeTruthy()
    })

    // Open the channel dropdown
    const channelSelectBtn = screen.getByText('浏览器推送').closest('button')
    fireEvent.click(channelSelectBtn)

    // Wait for the "邮件" option to appear
    await waitFor(() => {
      expect(screen.getByText('邮件')).toBeTruthy()
    })

    // Click the "邮件" option
    const emailOption = screen.getByText('邮件')
    fireEvent.click(emailOption)

    // No banner should appear because notifyEmail is true
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

describe('Alerts page — webhook channel', () => {
  it('Webhook 出现在 channel 下拉', async () => {
    mockFetch({ alerts: [] }, { notify_email: true, webhook_url: null })
    render(<MemoryRouter><Alerts /></MemoryRouter>)

    fireEvent.click(await screen.findByText('新增告警'))
    await waitFor(() => expect(screen.getByText('浏览器推送')).toBeTruthy())

    fireEvent.click(screen.getByText('浏览器推送').closest('button'))
    await waitFor(() => expect(screen.getByText('Webhook')).toBeTruthy())
  })

  it('选择 Webhook 后出现 URL 输入框', async () => {
    mockFetch({ alerts: [] }, { notify_email: true, webhook_url: null })
    render(<MemoryRouter><Alerts /></MemoryRouter>)

    fireEvent.click(await screen.findByText('新增告警'))
    await waitFor(() => expect(screen.getByText('浏览器推送')).toBeTruthy())

    fireEvent.click(screen.getByText('浏览器推送').closest('button'))
    await waitFor(() => expect(screen.getByText('Webhook')).toBeTruthy())
    fireEvent.click(screen.getByText('Webhook'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/留空则使用全局/)).toBeTruthy()
    })
  })

  it('全局 URL 和 per-alert URL 均为空时显示 warning banner', async () => {
    mockFetch({ alerts: [] }, { notify_email: true, webhook_url: null })
    render(<MemoryRouter><Alerts /></MemoryRouter>)

    fireEvent.click(await screen.findByText('新增告警'))
    await waitFor(() => expect(screen.getByText('浏览器推送')).toBeTruthy())

    fireEvent.click(screen.getByText('浏览器推送').closest('button'))
    await waitFor(() => expect(screen.getByText('Webhook')).toBeTruthy())
    fireEvent.click(screen.getByText('Webhook'))

    await waitFor(() => {
      expect(screen.queryByText(/Webhook URL 未配置/)).not.toBeNull()
    })
  })

  it('全局 URL 已配置时不显示 banner', async () => {
    mockFetch({ alerts: [] }, { notify_email: true, webhook_url: 'https://example.com/hook' })
    render(<MemoryRouter><Alerts /></MemoryRouter>)

    fireEvent.click(await screen.findByText('新增告警'))
    await waitFor(() => expect(screen.getByText('浏览器推送')).toBeTruthy())

    fireEvent.click(screen.getByText('浏览器推送').closest('button'))
    await waitFor(() => expect(screen.getByText('Webhook')).toBeTruthy())
    fireEvent.click(screen.getByText('Webhook'))

    await waitFor(() => {
      expect(screen.queryByText(/Webhook URL 未配置/)).toBeNull()
    })
  })

  it('已有 webhook 告警且全局 URL 为空时显示行内 banner', async () => {
    mockFetch(
      { alerts: [{ id: '1', kind: 'balance_low', threshold: '5', channel: 'webhook', enabled: true, webhookUrl: null }] },
      { notify_email: true, webhook_url: null },
    )
    render(<MemoryRouter><Alerts /></MemoryRouter>)
    await waitFor(() => {
      expect(screen.queryByText(/Webhook URL 未配置/)).not.toBeNull()
    })
  })
})
