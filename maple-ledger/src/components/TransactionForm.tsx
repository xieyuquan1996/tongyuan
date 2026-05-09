import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'

interface Transaction {
  id?: string; type: string; date: string; amount: number; currency: string
  usdRmbRate?: number; cadUsdMarketRate?: number; note?: string; category: string
  tax?: number; bankRate?: number; marketRateAtPurchase?: number
}

interface Props {
  initial?: Partial<Transaction>
  onClose: () => void
  onSaved: () => void
}

const CATEGORIES = [
  { value: 'api_topup', label: 'API 充值' },
  { value: 'user_payment', label: '用户付款' },
  { value: 'server', label: '服务器' },
  { value: 'other', label: '其他' },
]

export default function TransactionForm({ initial, onClose, onSaved }: Props) {
  const [type, setType] = useState(initial?.type ?? 'income')
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState(String(initial?.amount ?? ''))
  const [usdRmbRate, setUsdRmbRate] = useState(String(initial?.usdRmbRate ?? ''))
  const [cadUsdRate, setCadUsdRate] = useState(String(initial?.cadUsdMarketRate ?? ''))
  const [note, setNote] = useState(initial?.note ?? '')
  const [category, setCategory] = useState(initial?.category ?? 'other')
  const [tax, setTax] = useState(String(initial?.tax ?? ''))
  const [bankRate, setBankRate] = useState(String(initial?.bankRate ?? ''))
  const [marketRate, setMarketRate] = useState(String(initial?.marketRateAtPurchase ?? ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (type === 'income' && !cadUsdRate) {
      api<{ rate: number }>('/api/exchange-rate')
        .then(d => setCadUsdRate(String(d.rate)))
        .catch(() => {})
    }
  }, [type, cadUsdRate])

  const amountCadPreview = () => {
    if (type === 'expense') return Number(amount) || 0
    const r = Number(usdRmbRate)
    const c = Number(cadUsdRate)
    if (!r || !c || !amount) return null
    return Number(amount) / r * c
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const body: Record<string, unknown> = {
      type, date, amount: Number(amount), currency: type === 'income' ? 'RMB' : 'CAD',
      category, note: note || undefined,
    }
    if (type === 'income') {
      body.usdRmbRate = Number(usdRmbRate)
      body.cadUsdMarketRate = Number(cadUsdRate)
    } else {
      if (tax) body.tax = Number(tax)
      if (bankRate) body.bankRate = Number(bankRate)
      if (marketRate) body.marketRateAtPurchase = Number(marketRate)
    }
    try {
      if (initial?.id) {
        await api(`/api/transactions/${initial.id}`, { method: 'PUT', body })
      } else {
        await api('/api/transactions', { method: 'POST', body })
      }
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const preview = amountCadPreview()

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <h2 className="text-lg font-semibold mb-4">{initial?.id ? '编辑交易' : '新增交易'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => setType('income')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border ${type === 'income' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-600'}`}>
              收入
            </button>
            <button type="button" onClick={() => setType('expense')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border ${type === 'expense' ? 'bg-red-50 border-red-500 text-red-600' : 'border-gray-200 text-gray-600'}`}>
              支出
            </button>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">日期</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          {type === 'income' ? (
            <>
              <div>
                <label className="block text-sm text-gray-700 mb-1" htmlFor="amount-rmb">RMB 金额</label>
                <input id="amount-rmb" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">USD/RMB 汇率</label>
                  <input type="number" step="0.0001" value={usdRmbRate} onChange={e => setUsdRmbRate(e.target.value)} required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">CAD/USD 市场汇率</label>
                  <input type="number" step="0.0001" value={cadUsdRate} onChange={e => setCadUsdRate(e.target.value)} required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm text-gray-700 mb-1" htmlFor="amount-cad">CAD 金额</label>
                <input id="amount-cad" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">税（选填）</label>
                  <input type="number" step="0.01" value={tax} onChange={e => setTax(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">银行汇率</label>
                  <input type="number" step="0.0001" value={bankRate} onChange={e => setBankRate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">市场汇率</label>
                  <input type="number" step="0.0001" value={marketRate} onChange={e => setMarketRate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">分类</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">备注（选填）</label>
              <input type="text" value={note} onChange={e => setNote(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {preview !== null && (
            <div className="text-sm text-gray-500">
              换算后：<span className="font-medium text-blue-600">CA${preview.toFixed(4)}</span>
            </div>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              取消
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
