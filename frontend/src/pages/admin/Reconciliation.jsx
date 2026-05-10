import { useState, useEffect, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { api } from '../../lib/api.js'
import { Loading, ErrorBox, Pill } from '../../components/primitives.jsx'
import { PageHeader } from '../../components/dashboard-widgets.jsx'

function fmt(n) {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  return isNaN(num) ? '—' : (num >= 0 ? '+' : '') + num.toFixed(2) + '%'
}

function fmtTokens(n) {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString()
}

function StatusPill({ status }) {
  const tone = status === 'match' ? 'ok' : status === 'warn' ? 'warn' : 'err'
  return <Pill tone={tone} dot>{status}</Pill>
}

function diffColor(val) {
  if (val === null || val === undefined) return 'var(--text-3)'
  const n = Math.abs(Number(val))
  if (n >= 1) return 'var(--err)'
  if (n >= 0.1) return 'var(--warn-text)'
  return 'var(--ok-text)'
}

export default function Reconciliation() {
  const [upstreamKeys, setUpstreamKeys] = useState([])
  const [selectedKeyId, setSelectedKeyId] = useState('')
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/admin/upstream-keys').then((data) => {
      const withAdmin = (data.upstream_keys ?? []).filter((k) => k.hasAdminKey)
      setUpstreamKeys(withAdmin)
    }).catch(() => {})
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
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: p, pageSize: 50 })
      if (selectedKeyId) params.set('upstreamKeyId', selectedKeyId)
      if (bucketWidth) params.set('bucketWidth', bucketWidth)
      if (statusFilter) params.set('status', statusFilter)
      params.set('startAt', new Date(startAt).toISOString())
      params.set('endAt', new Date(endAt + 'T23:59:59Z').toISOString())
      const data = await api(`/api/admin/reconciliation/reports?${params}`)
      setReports(data.reports ?? [])
      setTotal(data.total ?? 0)
      setPage(p)
    } catch (e) {
      setError(e.message ?? '加载失败')
    } finally {
      setLoading(false)
    }
  }, [selectedKeyId, bucketWidth, statusFilter, startAt, endAt])

  const handleRun = async () => {
    setRunning(true)
    setError('')
    try {
      const ids = selectedKeyId ? [selectedKeyId] : upstreamKeys.map((k) => k.id)
      await api('/api/admin/reconciliation/run', {
        method: 'POST',
        body: {
          upstreamKeyIds: ids,
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
    bucket: bucketWidth === '1d' ? r.bucketAt.slice(0, 10) : r.bucketAt.slice(0, 16).replace('T', ' '),
    input: Number(r.inputDiffPct ?? 0),
    output: Number(r.outputDiffPct ?? 0),
  }))

  const statusByKey = {}
  for (const r of reports) {
    const alias = r.upstreamKeyAlias ?? r.upstreamKeyId.slice(0, 8)
    if (!statusByKey[alias]) statusByKey[alias] = { alias, match: 0, warn: 0, mismatch: 0 }
    statusByKey[alias][r.status]++
  }
  const keyStatusData = Object.values(statusByKey)

  return (
    <div>
      <PageHeader title="对账" sub={loading ? '加载中…' : `共 ${total} 条记录`} />

      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <select value={bucketWidth} onChange={(e) => setBucketWidth(e.target.value)} style={sel}>
          <option value="1d">粒度: 按天</option>
          <option value="1h">粒度: 按小时</option>
        </select>
        <select value={selectedKeyId} onChange={(e) => setSelectedKeyId(e.target.value)} style={sel}>
          <option value="">上游 Key: 全部</option>
          {upstreamKeys.map((k) => (
            <option key={k.id} value={k.id}>{k.alias}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={sel}>
          <option value="">状态: 全部</option>
          <option value="match">match</option>
          <option value="warn">warn</option>
          <option value="mismatch">mismatch</option>
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} style={dateInp} />
          <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>
          <input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} style={dateInp} />
        </div>
        <button
          onClick={handleRun}
          disabled={running || upstreamKeys.length === 0}
          style={{ ...cta, opacity: (running || upstreamKeys.length === 0) ? 0.5 : 1, cursor: (running || upstreamKeys.length === 0) ? 'default' : 'pointer' }}
        >
          {running ? '执行中…' : '执行对账'}
        </button>
      </div>

      {error && <ErrorBox error={error} />}

      {/* Charts */}
      {trendData.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={card}>
            <div style={chartTitle}>Token 差异趋势（%）</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: 'var(--text-3)', fontFamily: 'var(--font-mono)' }} />
                <YAxis tickFormatter={(v) => v + '%'} tick={{ fontSize: 10, fill: 'var(--text-3)', fontFamily: 'var(--font-mono)' }} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-mono)' }}
                  formatter={(v) => v.toFixed(3) + '%'}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} />
                <Line type="monotone" dataKey="input" name="Input 差异%" stroke="var(--clay)" dot={false} strokeWidth={1.5} />
                <Line type="monotone" dataKey="output" name="Output 差异%" stroke="var(--ok-text)" dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={card}>
            <div style={chartTitle}>各上游 Key 状态分布</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={keyStatusData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="alias" tick={{ fontSize: 10, fill: 'var(--text-3)', fontFamily: 'var(--font-mono)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)', fontFamily: 'var(--font-mono)' }} />
                <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-mono)' }} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} />
                <Bar dataKey="match" name="match" stackId="a" fill="var(--ok-text)" />
                <Bar dataKey="warn" name="warn" stackId="a" fill="var(--warn-text)" />
                <Bar dataKey="mismatch" name="mismatch" stackId="a" fill="var(--err)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? <Loading /> : (
        <div style={card}>
          <div className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 900 }}>
              <thead>
                <tr style={{ background: 'var(--surface-3)' }}>
                  <th style={th}>时间 bucket</th>
                  <th style={th}>上游 Key</th>
                  <th style={{ ...th, textAlign: 'right' }}>Input 差异%</th>
                  <th style={{ ...th, textAlign: 'right' }}>Output 差异%</th>
                  <th style={{ ...th, textAlign: 'right' }}>本地 Input</th>
                  <th style={{ ...th, textAlign: 'right' }}>Anthropic Input</th>
                  <th style={{ ...th, textAlign: 'right' }}>本地 Output</th>
                  <th style={{ ...th, textAlign: 'right' }}>Anthropic Output</th>
                  <th style={th}>状态</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      暂无对账记录
                    </td>
                  </tr>
                )}
                {reports.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--divider)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-3)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}>
                      {bucketWidth === '1d' ? r.bucketAt.slice(0, 10) : r.bucketAt.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {r.upstreamKeyAlias ?? r.upstreamKeyId.slice(0, 8)}
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right', color: diffColor(r.inputDiffPct) }}>
                      {fmt(r.inputDiffPct)}
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right', color: diffColor(r.outputDiffPct) }}>
                      {fmt(r.outputDiffPct)}
                    </td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right', fontSize: 12 }}>{fmtTokens(r.localInputTokens)}</td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right', fontSize: 12 }}>{fmtTokens(r.anthropicInputTokens)}</td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right', fontSize: 12 }}>{fmtTokens(r.localOutputTokens)}</td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', textAlign: 'right', fontSize: 12 }}>{fmtTokens(r.anthropicOutputTokens)}</td>
                    <td style={td}><StatusPill status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > 50 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--divider)', display: 'flex', gap: 6 }}>
              <button onClick={() => fetchReports(page - 1)} disabled={page === 1} style={pageBtn(page === 1)}>上一页</button>
              <button onClick={() => fetchReports(page + 1)} disabled={page * 50 >= total} style={pageBtn(page * 50 >= total)}>下一页</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const card = { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }
const th = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-3)', textAlign: 'left', padding: '10px 16px', fontWeight: 400 }
const td = { padding: '12px 16px', color: 'var(--text)' }
const sel = { padding: '8px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', cursor: 'pointer' }
const dateInp = { padding: '8px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', cursor: 'pointer' }
const cta = { padding: '8px 14px', background: 'var(--clay)', color: 'var(--on-clay)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-mono)' }
const chartTitle = { padding: '12px 16px 4px', fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)' }
const pageBtn = (disabled) => ({ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: disabled ? 'default' : 'pointer', color: disabled ? 'var(--text-3)' : 'var(--text-2)', fontFamily: 'var(--font-mono)' })
