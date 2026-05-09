// backend/src/routes/console/auth.ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { createUser, authenticate, toPublicUser } from '../../services/users.js'
import { issueSession, revokeSession } from '../../services/sessions.js'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { hashPassword, verifyPassword } from '../../crypto/password.js'
import { AppError } from '../../shared/errors.js'
import { db } from '../../db/client.js'
import { users, billingLedger } from '../../db/schema.js'
import { eq, and, gte, sql } from 'drizzle-orm'
import { toCny, getRate } from '../../shared/fx.js'
import { randomBytes } from 'node:crypto'
import { redis } from '../../redis/client.js'
import { getMailer } from '../../services/mailer/index.js'
import { env } from '../../env.js'

export const authRoutes = new Hono()

const registerBody = z.object({
  email: z.string(),
  password: z.string(),
  name: z.string().optional().default(''),
})

authRoutes.post('/register', zValidator('json', registerBody), async (c) => {
  const b = c.req.valid('json')
  const user = await createUser({ email: b.email, password: b.password, name: b.name })
  const { token, session } = await issueSession(user.id)
  return c.json({
    user: toPublicUser(user),
    session: { token, user_id: user.id, created_at: session.createdAt, expires_at: session.expiresAt },
  }, 201)
})

const loginBody = z.object({ email: z.string(), password: z.string() })

authRoutes.post('/login', zValidator('json', loginBody), async (c) => {
  const b = c.req.valid('json')
  const user = await authenticate(b.email, b.password)
  const { token, session } = await issueSession(user.id)
  return c.json({
    user: toPublicUser(user),
    session: { token, user_id: user.id, created_at: session.createdAt, expires_at: session.expiresAt },
  })
})

authRoutes.post('/logout', requireBearer, async (c) => {
  await revokeSession(c.get('sessionToken'))
  return c.json({ ok: true })
})

authRoutes.get('/me', requireBearer, async (c) => {
  const u = c.get('user')
  // Compute MTD spending to populate the sidebar usage widget.
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const [row] = await db.select({
    spentUsd: sql<string>`coalesce(sum(-amount_usd), 0)::text`,
  }).from(billingLedger)
    .where(and(eq(billingLedger.userId, u.id), eq(billingLedger.kind, 'debit_usage'), gte(billingLedger.createdAt, monthStart)))

  const spentUsd = Number(row!.spentUsd)
  const rate = await getRate()
  const pub = toPublicUser(u) as Record<string, unknown>
  pub.spent_this_month = toCny(spentUsd, rate).toFixed(2)
  pub.limit_this_month = u.limitMonthlyUsd ? toCny(Number(u.limitMonthlyUsd), rate).toFixed(2) : null
  return c.json(pub)
})

const profileBody = z.object({
  name: z.string().optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  theme: z.enum(['light', 'dark']).optional(),
  notify_email: z.boolean().optional(),
  notify_browser: z.boolean().optional(),
})
authRoutes.patch('/profile', requireBearer, zValidator('json', profileBody), async (c) => {
  const u = c.get('user')
  const b = c.req.valid('json')
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (b.name !== undefined) patch.name = b.name
  if (b.company !== undefined) patch.company = b.company
  if (b.phone !== undefined) patch.phone = b.phone
  if (b.theme !== undefined) patch.theme = b.theme
  if (b.notify_email !== undefined) patch.notifyEmail = b.notify_email
  if (b.notify_browser !== undefined) patch.notifyBrowser = b.notify_browser
  const [row] = await db.update(users).set(patch).where(eq(users.id, u.id)).returning()
  return c.json(toPublicUser(row!))
})

const passwordBody = z.object({ current: z.string(), next: z.string() })
authRoutes.post('/password', requireBearer, zValidator('json', passwordBody), async (c) => {
  const u = c.get('user')
  const b = c.req.valid('json')
  if (!(await verifyPassword(b.current, u.passwordHash))) throw new AppError('wrong_password')
  if (b.next.length < 6) throw new AppError('weak_password')
  await db.update(users).set({ passwordHash: await hashPassword(b.next), updatedAt: new Date() }).where(eq(users.id, u.id))
  return c.json({ ok: true })
})

authRoutes.post('/forgot', zValidator('json', z.object({ email: z.string() })), async (c) => {
  const { email } = c.req.valid('json')
  const hint = '如果该邮箱已注册，我们已经发送了重置链接。'

  const user = await db.query.users.findFirst({ where: eq(users.email, email.trim().toLowerCase()) })
  if (!user) return c.json({ ok: true, hint })

  const token = randomBytes(32).toString('hex')
  await redis.set(`pw_reset:${token}`, user.id, 'EX', 3600)

  const baseUrl = env.FRONTEND_URL ?? 'http://localhost:5173'
  const resetLink = `${baseUrl}/reset-password?token=${token}`

  await getMailer().send({
    to: user.email,
    subject: '密码重置链接',
    text: `请点击以下链接重置您的密码（1小时内有效）：\n\n${resetLink}\n\n如果您未申请重置密码，请忽略此邮件。`,
  })

  return c.json({ ok: true, hint })
})

authRoutes.post('/reset', zValidator('json', z.object({ token: z.string(), password: z.string() })), async (c) => {
  const { token, password } = c.req.valid('json')

  const userId = await redis.get(`pw_reset:${token}`)
  if (!userId) throw new AppError('invalid_or_expired_token')
  if (password.length < 6) throw new AppError('weak_password')

  await db.update(users).set({ passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(users.id, userId))
  await redis.del(`pw_reset:${token}`)

  return c.json({ ok: true })
})
