import { Hono } from 'hono'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { sendWebhook } from '../../services/webhook-sender.js'
import { AppError } from '../../shared/errors.js'

export const webhooksRoutes = new Hono()
webhooksRoutes.use('*', requireBearer)

webhooksRoutes.post('/test', async (c) => {
  const user = c.get('user')
  const url = user.webhookUrl
  if (!url) throw new AppError('no_webhook_url', 'Webhook URL 未配置')

  const payload = {
    kind: 'test',
    message: '这是 Claude Link 发送的测试 Webhook 请求。',
    triggered_at: new Date().toISOString(),
  }

  const result = await sendWebhook(url, user.webhookToken ?? null, payload)
  return c.json({ ok: result.ok, status_code: result.statusCode ?? null })
})
