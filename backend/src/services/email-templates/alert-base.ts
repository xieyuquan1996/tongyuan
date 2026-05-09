export function wrapLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:28px 32px;border-radius:12px 12px 0 0;">
        <div style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Claude Link</div>
        <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:4px;">${title}</div>
      </td></tr>
      <!-- Body -->
      <tr><td style="background:#fff;padding:28px 32px;">
        ${bodyHtml}
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:#f8f9fa;padding:16px 32px;border-radius:0 0 12px 12px;border-top:1px solid #e5e7eb;">
        <div style="font-size:12px;color:#9ca3af;text-align:center;">
          此邮件由系统自动发送 · <a href="/dashboard/alerts" style="color:#667eea;text-decoration:none;">管理告警设置</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}
