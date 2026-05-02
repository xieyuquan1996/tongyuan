// backend/src/routes/console/keys.ts
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireBearer } from '../../middleware/auth-bearer.js'
import { createKey, listKeys, patchKey, revokeKey, toPublicKey } from '../../services/api-keys.js'

export const keysRoutes = new Hono()
keysRoutes.use('*', requireBearer)

keysRoutes.get('/', async (c) => {
  const rows = await listKeys(c.get('user').id)
  return c.json({ keys: rows.map(toPublicKey) })
})

keysRoutes.post('/', zValidator('json', z.object({
  name: z.string().min(1),
  rpm_limit: z.number().int().positive().nullable().optional(),
  tpm_limit: z.number().int().positive().nullable().optional(),
})), async (c) => {
  const { name, rpm_limit, tpm_limit } = c.req.valid('json')
  const { row, secret } = await createKey(c.get('user').id, name)
  // If the create call set limits, fold them in via patchKey so the row
  // returned reflects the user's choices. Skips an extra DB call when not set.
  let final = row
  if (rpm_limit !== undefined || tpm_limit !== undefined) {
    final = await patchKey(c.get('user').id, row.id, {
      rpmLimit: rpm_limit ?? null,
      tpmLimit: tpm_limit ?? null,
    })
  }
  return c.json({ ...toPublicKey(final), secret }, 201)
})

// PATCH covers name + RPM/TPM limits. Limits accept null (clear), positive
// int (set), or omitted (leave alone).
keysRoutes.patch('/:id', zValidator('json', z.object({
  name: z.string().min(1).optional(),
  rpm_limit: z.number().int().positive().nullable().optional(),
  tpm_limit: z.number().int().positive().nullable().optional(),
})), async (c) => {
  const b = c.req.valid('json')
  const row = await patchKey(c.get('user').id, c.req.param('id'), {
    name: b.name,
    rpmLimit: b.rpm_limit,
    tpmLimit: b.tpm_limit,
  })
  return c.json(toPublicKey(row))
})

keysRoutes.post('/:id/revoke', async (c) => {
  const row = await revokeKey(c.get('user').id, c.req.param('id'))
  return c.json(toPublicKey(row))
})
