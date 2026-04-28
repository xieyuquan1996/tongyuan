// backend/src/routes/admin/keys.ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq } from 'drizzle-orm'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { requireAdmin } from '../../middleware/auth-admin.js'
import { db } from '../../db/client.js'
import { apiKeys, users } from '../../db/schema.js'
import { AppError } from '../../shared/errors.js'

export const adminKeysRoutes = new Hono()
adminKeysRoutes.use('*', requireBearer, requireAdmin)

adminKeysRoutes.get('/', async (c) => {
  const state = c.req.query('state')
  const rows = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      state: apiKeys.state,
      rpmLimit: apiKeys.rpmLimit,
      tpmLimit: apiKeys.tpmLimit,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      ownerEmail: users.email,
    })
    .from(apiKeys)
    .leftJoin(users, eq(apiKeys.userId, users.id))
    .where(state ? eq(apiKeys.state, state) : undefined)
    .orderBy(desc(apiKeys.createdAt))

  return c.json({
    keys: rows.map((r) => ({
      id: r.id,
      user_id: r.userId,
      name: r.name,
      prefix: r.prefix,
      state: r.state,
      rpm_limit: r.rpmLimit,
      tpm_limit: r.tpmLimit,
      created_at: r.createdAt,
      last_used_at: r.lastUsedAt,
      revoked_at: r.revokedAt,
      owner_email: r.ownerEmail,
    })),
  })
})

adminKeysRoutes.post('/:id/revoke', zValidator('json', z.object({
  reason: z.string().optional().default('admin revoke'),
})), async (c) => {
  const [row] = await db.update(apiKeys)
    .set({ state: 'revoked', revokedAt: new Date() })
    .where(eq(apiKeys.id, c.req.param('id')))
    .returning()
  if (!row) throw new AppError('not_found')
  return c.json({ ok: true })
})
