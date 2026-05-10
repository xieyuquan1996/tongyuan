// frontend/src/pages/admin/Reconciliation.jsx
import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts'
import { api } from '../../lib/api.js'

const STATUS_COLOR = { match: 'text-green-600', warn: 'text-yellow-600', mismatch: 'text-red-600' }
const STATUS_BG = { match: 'bg-green-50', warn: 'bg-yellow-50', mismatch: 'bg-red-50' }

function fmt(n) {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  return isNaN(num) ? '—' : num.toFixed(2) + '%'
}

function fmtTokens(n) {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString()
}

export default function Reconciliation() {
  const [upstreamKeys, setUpstreamKeys] = useState([])
  const [selectedKeys, setSelectedKeys] = useState([])
  const [bucketWidth, setBucketWidth] = useState('1d')
  const [startAt, setStartAt] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10)
  })
  const [endAt, setEndAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [statusFilter, setStatusFilter] = useState('')
  const [running, setRunning] = useState(false)
  const [reports, setReports] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/admin/upstream-keys').then((data) => {
      const withAdmin = (data.upstream_keys ?? []).filter((k) => k.hasAdminKey)
      setUpstreamKeys(withAdmin)
      setSelectedKeys(withAdmin.map((k) => k.id))
    })
  }, [])

  useEffect(() => {
    const maxDays = bucketWidth === '1h' ? 7 : 31
    const start = new Date(startAt)
    const end = new Date(endAt)
    const diffDays = (end - start) / (1000 * 60 * 60 * 24)
    if (diffDays > maxDays) {
      const newStart = new Date(end)
      newStart.setDate(newStart.getDate() - maxDays)
      setStartAt(newStart.toISOString().slice(0, 10))
    }
  }, [bucketWidth])

  const fetchReports = useCallback(async (p = 1) => {
    const params = new URLSearchParams({ page: p, pageSize: 50 })
    if (selectedKeys.length === 1) params.set('upstreamKeyId', selectedKeys[0])
    if (bucketWidth) params.set('bucketWidth', bucketWidth)
    if (statusFilter) params.set('status', statusFilter)
    params.set('startAt', new Date(startAt).toISOString())
    params.set('endAt', new Date(endAt + 'T23:59:59Z').toISOString())
    const data = await api(`/api/admin/reconciliation/reports?${params}`)
    setReports(data.reports ?? [])
    setTotal(data.total ?? 0)
    setPage(p)
  }, [selectedKeys, bucketWidth, statusFilter, startAt, endAt])

  const handleRun = async () => {
    setRunning(true)
    setError('')
    try {
      await api('/api/admin/reconciliation/run', {
        method: 'POST',
        body: {
          upstreamKeyIds: selectedKeys,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt + 'T23:59:59Z').toISOString(),
          bucketWidth,
        },
      })
      await fetchReports(1)
    } catch (e) {
      setError(e.message ?? '对账失败')
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => { fetchReports(1) }, [fetchReports])

  const trendData = reports.map((r) => ({
    bucket: bucketWidth === '1d'
      ? r.bucketAt.slice(0, 10)
      : r.bucketAt.slice(0, 16).replace('T', ' '),
    input: Number(r.inputDiffPct ?? 0),
    output: Number(r.outputDiffPct ?? 0),
    alias: r.upstreamKeyAlias,
  }))

  const statusByKey = {}
  for (const r of reports) {
    const alias = r.upstreamKeyAlias ?? r.upstreamKeyId.slice(0, 8)
    if (!statusByKey[alias]) statusByKey[alias] = { alias, match: 0, warn: 0, mismatch: 0 }
    statusByKey[alias][r.status]++
  }
  const keyStatusData = Object.values(statusByKey)

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">对账</h1>

      <div className="flex flex-wrap gap-3 items-end bg-white border rounded-lg p-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">粒度</label>
          <select
            value={bucketWidth}
            onChange={(e) => setBucketWidth(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="1d">按天（最多31天）</option>
            <option value="1h">按小时（最多7天）</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">开始日期</label>
          <input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)}
            className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">结束日期</label>
          <input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)}
            className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">上游 Key</label>
          <select
            multiple
            value={selectedKeys}
            onChange={(e) => setSelectedKeys([...e.target.selectedOptions].map((o) => o.value))}
            className="border rounded px-2 py-1 text-sm min-w-[160px]"
            size={Math.min(upstreamKeys.length + 1, 4)}
          >
            {upstreamKeys.map((k) => (
              <option key={k.id} value={k.id}>{k.alias}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">状态筛选</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded px-2 py-1 text-sm">
            <option value="">全部</option>
            <option value="match">match</option>
            <option value="warn">warn</option>
            <option value="mismatch">mismatch</option>
          </select>
        </div>
        <button
          onClick={handleRun}
          disabled={running || selectedKeys.length === 0}
          className="px-4 py-1.5 bg-black text-white rounded text-sm disabled:opacity-50"
        >
          {running ? '执行中…' : '执行对账'}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {trendData.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-sm font-medium mb-3">Token 差异趋势（%）</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => v + '%'} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => v.toFixed(3) + '%'} />
              <Legend />
              <Line type="monotone" dataKey="input" name="Input 差异%" stroke="#6366f1" dot={false} />
              <Line type="monotone" dataKey="output" name="Output 差异%" stroke="#f59e0b" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {keyStatusData.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-sm font-medium mb-3">各上游 Key 对账状态分布</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={keyStatusData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="alias" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="match" name="match" stackId="a" fill="#22c55e" />
              <Bar dataKey="warn" name="warn" stackId="a" fill="#eab308" />
              <Bar dataKey="mismatch" name="mismatch" stackId="a" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b text-sm text-gray-500">
          共 {total} 条记录，当前显示第 {page} 页
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">时间 bucket</th>
                <th className="px-3 py-2 text-left">上游 Key</th>
                <th className="px-3 py-2 text-right">Input 差异%</th>
                <th className="px-3 py-2 text-right">Output 差异%</th>
                <th className="px-3 py-2 text-right">本地 Input</th>
                <th className="px-3 py-2 text-right">Anthropic Input</th>
                <th className="px-3 py-2 text-right">本地 Output</th>
                <th className="px-3 py-2 text-right">Anthropic Output</th>
                <th className="px-3 py-2 text-center">状态</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className={`border-t ${STATUS_BG[r.status] ?? ''}`}>
                  <td className="px-3 py-2 font-mono text-xs">
                    {bucketWidth === '1d' ? r.bucketAt.slice(0, 10) : r.bucketAt.slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="px-3 py-2">{r.upstreamKeyAlias ?? r.upstreamKeyId.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(r.inputDiffPct)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(r.outputDiffPct)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtTokens(r.localInputTokens)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtTokens(r.anthropicInputTokens)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtTokens(r.localOutputTokens)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtTokens(r.anthropicOutputTokens)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs font-medium ${STATUS_COLOR[r.status] ?? ''}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
              {reports.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">暂无对账记录</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {total > 50 && (
          <div className="px-4 py-3 border-t flex gap-2">
            <button onClick={() => fetchReports(page - 1)} disabled={page === 1}
              className="px-3 py-1 border rounded text-sm disabled:opacity-40">上一页</button>
            <button onClick={() => fetchReports(page + 1)} disabled={page * 50 >= total}
              className="px-3 py-1 border rounded text-sm disabled:opacity-40">下一页</button>
          </div>
        )}
      </div>
    </div>
  )
}
