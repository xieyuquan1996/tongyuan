// backend/src/routes/console/auth.ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { createUser, authenticate, toPublicUser } from '../../services/users.js'
import { issueSession } from '../../services/sessions.js'

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
