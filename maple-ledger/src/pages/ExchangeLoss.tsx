import { useState, useEffect } from 'react'
import { api } from '../lib/api.js'

interface LossRecord {
  id: string; date: string; amount: number; bank_rate: number
  market_rate_at_purchase: number; loss_cad: number; loss_pct: number
}

interface LossReport {
  total_loss_cad: number
  avg_loss_pct: number
  records: LossRecord[]
}

export default function ExchangeLoss() {
  const now = new Date()
  const [from, setFrom] = useState(`${now.getFullYear()}-01-01`)
  const [to, setTo] = useState(now.toISOString().slice(0, 10))
  const [data, setData] = useState<LossReport | null>(null)

  useEffect(() => {
    api<LossReport>(`/api/reports/exchange-loss?from=${from}&to=${to}`)
      .then(setData).catch(() => {})
  }, [from, to])

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm text-gray-600">从</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        <label className="text-sm text-gray-600">到</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500 mb-1">总汇率损耗</div>
              <div className="text-xl font-semibold text-red-600">CA${data.total_loss_cad.toFixed(4)}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500 mb-1">平均损耗百分比</div>
              <div className="text-xl font-semibold text-red-600">{data.avg_loss_pct.toFixed(2)}%</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">日期</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">金额 (CAD)</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">银行汇率</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">市场汇率</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">损耗 (CAD)</th>
                  <th className="text-right px-4 py-3 text-gray-600 font-medium">损耗%</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map(r => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{r.date}</td>
                    <td className="px-4 py-3 text-right text-gray-700">CA${r.amount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.bank_rate.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.market_rate_at_purchase.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right text-red-600">CA${r.loss_cad.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{r.loss_pct.toFixed(2)}%</td>
                  </tr>
                ))}
                {data.records.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      所选时间段内无含汇率数据的支出记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
