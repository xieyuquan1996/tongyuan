import { wrapLayout } from './alert-base.js'

const AMBER = '#f59e0b'
const INDIGO = '#4338ca'

export function renderP99Latency(data: {
  p99Ms: number
  threshold: number
  triggeredAt: Date
}): { subject: string; html: string; text: string } {
  const p99Str = `${data.p99Ms}ms`
  const thresholdStr = `${data.threshold}ms`
  const triggeredStr = data.triggeredAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) + '（北京时间）'

  const subject = 'P99 延迟告警'

  const body = `
    <div style="border-left:4px solid ${AMBER};padding-left:16px;margin-bottom:20px;">
      <div style="font-size:16px;font-weight:600;color:#111827;margin-bottom:4px;">P99 延迟告警</div>
      <div style="font-size:13px;color:#6b7280;">请求 P99 延迟已超过设定阈值。</div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td width="48%" style="background:linear-gradient(135deg,#fffbeb,#fefce8);border:1px solid #fde68a;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">当前值</div>
          <div style="font-size:22px;font-weight:700;color:${AMBER};">${p99Str}</div>
        </td>
        <td width="4%"></td>
        <td width="48%" style="background:linear-gradient(135deg,#eef2ff,#f5f3ff);border:1px solid #c7d2fe;border-radius:8px;padding:16px;text-align:center;">
          <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">告警阈值</div>
          <div style="font-size:22px;font-weight:700;color:${INDIGO};">${thresholdStr}</div>
        </td>
      </tr>
    </table>
    <div style="border-top:1px solid #f3f4f6;padding-top:14px;">
      <div style="font-size:12px;color:#9ca3af;">触发时间：${triggeredStr}</div>
    </div>
  `

  const html = wrapLayout(subject, body)
  const text = `本次请求延迟（${p99Str}）已超过设定阈值 ${thresholdStr}。触发时间：${triggeredStr}`

  return { subject, html, text }
}
