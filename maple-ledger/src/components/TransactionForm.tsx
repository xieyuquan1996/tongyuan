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
  onSaved: (date: string) => void
}

const INCOME_CATEGORIES = [
  { value: 'user_payment', label: '用户付款' },
  { value: 'other', label: '其他' },
]

const EXPENSE_CATEGORIES = [
  { value: 'api_topup', label: 'API 充值' },
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
  const [category, setCategory] = useState(initial?.category ?? 'user_payment')
  const [tax, setTax] = useState(String(initial?.tax ?? ''))
  const [usdAmount, setUsdAmount] = useState(
    initial?.bankRate && initial?.amount ? String(Math.round(initial.bankRate * initial.amount * 10000) / 10000) : ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!cadUsdRate) {
      api<{ rate: number }>('/api/exchange-rate')
        .then(d => setCadUsdRate(String(d.rate)))
        .catch(() => {})
    }
  }, [cadUsdRate])

  const amountCadPreview = () => {
    if (type === 'expense') return Number(amount) || 0
    const r = Number(usdRmbRate)
    const c = Number(cadUsdRate)
    if (!r || !c || !amount) return null
    return Number(amount) / r * c
  }

  const exchangeLossPreview = () => {
    const cad = Number(amount)
    const usd = Number(usdAmount)
    const rate = Number(cadUsdRate)
    if (!cad || !usd || !rate) return null
    return cad - usd / rate
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
      body.tax = tax ? Number(tax) : null
      if (usdAmount && amount) {
        body.bankRate = Number(usdAmount) / Number(amount)
        body.marketRateAtPurchase = cadUsdRate ? Number(cadUsdRate) : null
      } else {
        body.bankRate = null
        body.marketRateAtPurchase = null
      }
    }
    try {
      if (initial?.id) {
        await api(`/api/transactions/${initial.id}`, { method: 'PUT', body })
      } else {
        await api('/api/transactions', { method: 'POST', body })
      }
      onSaved(date)
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
            <button type="button" onClick={() => { setType('income'); setCategory('user_payment') }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border ${type === 'income' ? 'bg-green-50 border-green-500 text-green-700' : 'border-gray-200 text-gray-600'}`}>
              收入
            </button>
            <button type="button" onClick={() => { setType('expense'); setCategory('api_topup') }}
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1" htmlFor="amount-cad">支出加币 (CAD)</label>
                  <input id="amount-cad" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required
                    placeholder="如：100.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <p className="text-xs text-gray-400 mt-1">银行实际扣款总额</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">消费税 CAD <span className="text-gray-400">（选填）</span></label>
                  <input type="number" step="0.01" value={tax} onChange={e => setTax(e.target.value)}
                    placeholder="如：5.20"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <p className="text-xs text-gray-400 mt-1">银行账单中的 GST/消费税</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">购入美元 <span className="text-gray-400">（选填，涉及换汇时填）</span></label>
                  <input type="number" step="0.01" value={usdAmount} onChange={e => setUsdAmount(e.target.value)}
                    placeholder="如：72.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <p className="text-xs text-gray-400 mt-1">充入 Anthropic 的美元金额</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    市场汇率 CAD/USD
                    {cadUsdRate && <span className="text-gray-400 font-normal"> （自动获取）</span>}
                  </label>
                  <input type="number" step="0.0001" value={cadUsdRate} onChange={e => setCadUsdRate(e.target.value)}
                    placeholder="如：0.7410"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <p className="text-xs text-gray-400 mt-1">用于计算汇率损耗，可手动修正</p>
                </div>
              </div>
              {exchangeLossPreview() !== null && exchangeLossPreview()! > 0 && (
                <div className="text-sm bg-amber-50 rounded-lg px-3 py-2 text-amber-700">
                  预估汇率损耗：<span className="font-medium">CA${exchangeLossPreview()!.toFixed(2)}</span>
                  <span className="text-xs text-amber-500 ml-2">（{((exchangeLossPreview()! / Number(amount)) * 100).toFixed(2)}%）</span>
                  <p className="text-xs text-amber-500 mt-1">= 支出 {Number(amount).toFixed(2)} − 购入 {Number(usdAmount).toFixed(2)} USD ÷ 市场汇率 {Number(cadUsdRate).toFixed(4)}</p>
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-700 mb-1">分类</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {(type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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
