import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'

interface Report {
  month: string
  income_rmb: number
  income_cad: number
  expense_cad: number
  profit_cad: number
  tx_count: number
}

export default function MonthlyReport() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [report, setReport] = useState<Report | null>(null)
  const [history, setHistory] = useState<Report[]>([])

  useEffect(() => {
    api<Report>(`/api/reports/monthly?month=${month}`).then(setReport).catch(() => {})
  }, [month])

  useEffect(() => {
    const [y, mo] = month.split('-').map(Number)
    const months: Promise<Report>[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(y, (mo as number) - 1 - i, 1)
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months.push(api<Report>(`/api/reports/monthly?month=${m}`))
    }
    Promise.all(months).then(setHistory).catch(() => {})
  }, [month])

  const profitRate = report && report.income_cad > 0
    ? (report.profit_cad / report.income_cad * 100).toFixed(1)
    : null

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
      <div className="flex items-center gap-3 mb-6">
        <button onClick={prevMonth} className="text-gray-500 hover:text-gray-900 px-2">‹</button>
        <span className="text-lg font-semibold">{month}</span>
        <button onClick={nextMonth} className="text-gray-500 hover:text-gray-900 px-2">›</button>
      </div>

      {report && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <StatCard label="总收入 (RMB)" value={`¥${report.income_rmb.toFixed(2)}`} />
          <StatCard label="总收入 (CAD)" value={`CA$${report.income_cad.toFixed(2)}`} />
          <StatCard label="总支出 (CAD)" value={`CA$${report.expense_cad.toFixed(2)}`} />
          <StatCard label="利润 (CAD)" value={`CA$${report.profit_cad.toFixed(2)}`}
            highlight={report.profit_cad >= 0 ? 'green' : 'red'} />
          {profitRate && <StatCard label="利润率" value={`${profitRate}%`} />}
          <StatCard label="交易笔数" value={String(report.tx_count)} />
        </div>
      )}

      <h3 className="text-sm font-medium text-gray-600 mb-3">近 6 个月利润趋势</h3>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">月份</th>
              <th className="text-right px-4 py-3 text-gray-600 font-medium">收入 (CAD)</th>
              <th className="text-right px-4 py-3 text-gray-600 font-medium">支出 (CAD)</th>
              <th className="text-right px-4 py-3 text-gray-600 font-medium">利润 (CAD)</th>
            </tr>
          </thead>
          <tbody>
            {history.map(r => (
              <tr key={r.month} className={`border-b border-gray-100 ${r.month === month ? 'bg-blue-50' : ''}`}>
                <td className="px-4 py-3 text-gray-700">{r.month}</td>
                <td className="px-4 py-3 text-right text-green-700">CA${r.income_cad.toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-red-600">CA${r.expense_cad.toFixed(2)}</td>
                <td className={`px-4 py-3 text-right font-medium ${r.profit_cad >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                  CA${r.profit_cad.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: 'green' | 'red' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-semibold ${
        highlight === 'green' ? 'text-green-700' : highlight === 'red' ? 'text-red-600' : 'text-gray-900'
      }`}>{value}</div>
    </div>
  )
}
