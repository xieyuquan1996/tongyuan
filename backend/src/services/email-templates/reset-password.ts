import { wrapLayout } from './alert-base.js'

const PURPLE = '#667eea'

export function renderResetPassword(data: {
  resetLink: string
}): { subject: string; html: string; text: string } {
  const subject = '密码重置链接'

  const body = `
    <div style="margin-bottom:24px;">
      <div style="font-size:16px;font-weight:600;color:#111827;margin-bottom:8px;">重置您的密码</div>
      <div style="font-size:14px;color:#6b7280;line-height:1.6;">
        我们收到了重置您账户密码的请求。点击下方按钮重置密码，链接将在 <strong>1小时</strong> 后失效。
      </div>
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${data.resetLink}"
         style="display:inline-block;padding:12px 32px;background:${PURPLE};color:#fff;
                text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;
                letter-spacing:0.01em;">
        重置密码
      </a>
    </div>
    <div style="border-top:1px solid #f3f4f6;padding-top:16px;">
      <div style="font-size:12px;color:#9ca3af;line-height:1.6;">
        如果按钮无法点击，请复制以下链接到浏览器地址栏：<br/>
        <span style="color:${PURPLE};word-break:break-all;">${data.resetLink}</span>
      </div>
      <div style="font-size:12px;color:#9ca3af;margin-top:8px;">
        如果您未申请重置密码，请忽略此邮件，您的账户不会受到任何影响。
      </div>
    </div>
  `

  const html = wrapLayout(subject, body)
  const text = `请点击以下链接重置您的密码（1小时内有效）：\n\n${data.resetLink}\n\n如果您未申请重置密码，请忽略此邮件。`

  return { subject, html, text }
}
