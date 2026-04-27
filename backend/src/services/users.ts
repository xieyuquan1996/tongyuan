// backend/src/services/users.ts
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'
import { AppError } from '../shared/errors.js'
import { hashPassword, verifyPassword } from '../crypto/password.js'

export type UserRow = typeof users.$inferSelect

export async function createUser(input: { email: string; password: string; name: string }): Promise<UserRow> {
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('invalid_email')
  if (input.password.length < 6) throw new AppError('weak_password')

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (existing) throw new AppError('email_exists')

  const passwordHash = await hashPassword(input.password)
  const [row] = await db.insert(users).values({ email, passwordHash, name: input.name ?? '' }).returning()
  return row!
}

export async function authenticate(email: string, password: string): Promise<UserRow> {
  const row = await db.query.users.findFirst({ where: eq(users.email, email.trim().toLowerCase()) })
  if (!row) throw new AppError('invalid_credentials')
  if (row.status === 'suspended') throw new AppError('account_suspended')
  const ok = await verifyPassword(password, row.passwordHash)
  if (!ok) throw new AppError('invalid_credentials')
  return row
}

export function toPublicUser(row: UserRow) {
  const { passwordHash: _omit, ...rest } = row
  return rest
}
