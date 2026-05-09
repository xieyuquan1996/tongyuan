import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TransactionForm from './TransactionForm.js'

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ rate: 0.74, date: '2026-05-09', source: 'cache' }), { status: 200 })
  )
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('TransactionForm', () => {
  it('renders income and expense type toggles', () => {
    render(<TransactionForm onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByText('收入')).toBeInTheDocument()
    expect(screen.getByText('支出')).toBeInTheDocument()
  })

  it('shows RMB amount field when type is income', () => {
    render(<TransactionForm onClose={() => {}} onSaved={() => {}} />)
    fireEvent.click(screen.getByText('收入'))
    expect(screen.getByLabelText(/RMB 金额/)).toBeInTheDocument()
  })

  it('shows CAD amount field when type is expense', () => {
    render(<TransactionForm onClose={() => {}} onSaved={() => {}} />)
    fireEvent.click(screen.getByText('支出'))
    expect(screen.getByLabelText(/支出加币/)).toBeInTheDocument()
  })

  it('calls onClose when cancel button clicked', () => {
    const onClose = vi.fn()
    render(<TransactionForm onClose={onClose} onSaved={() => {}} />)
    fireEvent.click(screen.getByText('取消'))
    expect(onClose).toHaveBeenCalled()
  })
})
