import { useState, useEffect, useCallback } from 'react'
import SummaryCards from '../components/SummaryCards.js'
import TransactionForm from '../components/TransactionForm.js'
import { api } from '../lib/api.js'

interface Transaction {
  id: string; type: string; date: string; amount: number; currency: string
  usd_rmb_rate?: number; cad_usd_market_rate?: number; amount_cad: number
  note?: string; category: string; created_by: string
  tax?: number; bank_rate?: number; market_rate_at_purchase?: number
}

interface MonthlyReport {
  income_rmb: number; income_cad: number; expense_cad: number; profit_cad: number; tx_count: number
}

const CATEGORY_LABELS: Record<string, string> = {
  api_topup: 'API充值', user_payment: '用户付款', server: '服务器', other: '其他',
}

export default function Transactions() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Transaction | undefined>()
  const [filterType, setFilterType] = useState('')
  const [toast, setToast] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ month })
    if (filterType) params.set('type', filterType)
    const [txs, rep] = await Promise.all([
      api<Transaction[]>(`/api/transactions?${params}`),
      api<MonthlyReport>(`/api/reports/monthly?month=${month}`),
    ])
    setTransactions(txs)
    setReport(rep)
  }, [month, filterType])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    try {
      await api(`/api/transactions/${id}`, { method: 'DELETE' })
      setConfirmDeleteId(null)
      setToast('已删除')
      setTimeout(() => setToast(''), 2500)
      load()
    } catch (err) {
      setConfirmDeleteId(null)
      setToast(`删除失败：${(err as Error).message}`)
      setTimeout(() => setToast(''), 3000)
    }
  }

  const prevMonth = () => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, (m as number) - 2, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const nextMonth = () => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m as number, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="text-gray-500 hover:text-gray-900 px-2">‹</button>
          <span className="text-lg font-semibold">{month}</span>
          <button onClick={nextMonth} className="text-gray-500 hover:text-gray-900 px-2">›</button>
        </div>
        <div className="flex items-center gap-3">
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
            <option value="">全部类型</option>
            <option value="income">收入</option>
            <option value="expense">支出</option>
          </select>
          <button onClick={() => { setEditing(undefined); setShowForm(true) }}
            className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700">
            + 新增交易
          </button>
        </div>
      </div>

      {report && (
        <SummaryCards
          incomeCad={report.income_cad}
          expenseCad={report.expense_cad}
          profitCad={report.profit_cad}
          txCount={report.tx_count}
        />
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">日期</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">类型</th>
              <th className="text-right px-4 py-3 text-gray-600 font-medium">金额</th>
              <th className="text-right px-4 py-3 text-gray-600 font-medium">CAD</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">分类</th>
              <th className="hidden sm:table-cell text-left px-4 py-3 text-gray-600 font-medium">备注</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(tx => (
              <tr key={tx.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700">{tx.date}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    tx.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {tx.type === 'income' ? '收入' : '支出'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {tx.currency === 'RMB' ? '¥' : 'CA$'}{tx.amount.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  CA${tx.amount_cad.toFixed(4)}
                </td>
                <td className="px-4 py-3 text-gray-500">{CATEGORY_LABELS[tx.category] ?? tx.category}</td>
                <td className="hidden sm:table-cell px-4 py-3 text-gray-500">{tx.note ?? '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setEditing(tx); setShowForm(true) }}
                      className="text-blue-500 hover:text-blue-700 text-xs">编辑</button>
                    <button onClick={() => setConfirmDeleteId(tx.id)}
                      className="text-red-400 hover:text-red-600 text-xs">删除</button>
                  </div>
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">本月暂无交易记录</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-80 mx-4">
            <p className="text-gray-900 font-medium mb-1">确认删除？</p>
            <p className="text-sm text-gray-500 mb-5">此操作无法撤销。</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                取消
              </button>
              <button onClick={() => handleDelete(confirmDeleteId)}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600">
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <TransactionForm
          initial={editing ? {
            ...editing,
            usdRmbRate: editing.usd_rmb_rate,
            cadUsdMarketRate: editing.cad_usd_market_rate,
            bankRate: editing.bank_rate,
            marketRateAtPurchase: editing.market_rate_at_purchase,
          } : undefined}
          onClose={() => setShowForm(false)}
          onSaved={(date) => {
            setShowForm(false)
            const savedMonth = date.slice(0, 7)
            if (savedMonth === month) {
              load()
            } else {
              setMonth(savedMonth)
            }
            setToast(editing ? '已更新' : '已保存')
            setTimeout(() => setToast(''), 2500)
          }}
        />
      )}
    </div>
  )
}
