// backend/src/services/users.ts
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users, settings, billingLedger } from '../db/schema.js'
import { AppError } from '../shared/errors.js'
import { hashPassword, verifyPassword } from '../crypto/password.js'

const MAX_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15
const DEFAULT_SIGNUP_CREDIT_USD = 10

export type UserRow = typeof users.$inferSelect

async function getSignupCreditUsd(): Promise<number> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, 'signup_credit_usd') })
  const n = row ? Number(row.value) : DEFAULT_SIGNUP_CREDIT_USD
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SIGNUP_CREDIT_USD
}

export async function createUser(input: { email: string; password: string; name: string }): Promise<UserRow> {
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('invalid_email')
  if (input.password.length < 6) throw new AppError('weak_password')

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (existing) throw new AppError('email_exists')

  const passwordHash = await hashPassword(input.password)
  const creditUsd = await getSignupCreditUsd()
  const balanceStr = creditUsd.toFixed(6)

  return await db.transaction(async (tx) => {
    const [row] = await tx.insert(users)
      .values({ email, passwordHash, name: input.name ?? '', balanceUsd: balanceStr })
      .returning()
    if (creditUsd > 0) {
      await tx.insert(billingLedger).values({
        userId: row!.id,
        kind: 'credit_signup',
        amountUsd: balanceStr,
        balanceAfterUsd: balanceStr,
        note: '新用户注册赠送',
      })
    }
    return row!
  })
}

export async function authenticate(email: string, password: string): Promise<UserRow> {
  const row = await db.query.users.findFirst({ where: eq(users.email, email.trim().toLowerCase()) })
  if (!row) throw new AppError('invalid_credentials')
  if (row.status === 'suspended') throw new AppError('account_suspended')

  // Check lockout
  if (row.lockedUntil && row.lockedUntil > new Date()) {
    const mins = Math.ceil((row.lockedUntil.getTime() - Date.now()) / 60_000)
    throw new AppError('account_locked', `账户已锁定，请 ${mins} 分钟后再试`)
  }

  const ok = await verifyPassword(password, row.passwordHash)
  if (!ok) {
    const attempts = (row.failedLoginAttempts ?? 0) + 1
    const patch: Partial<typeof users.$inferInsert> =
      attempts >= MAX_ATTEMPTS
        ? { failedLoginAttempts: attempts, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) }
        : { failedLoginAttempts: attempts }
    await db.update(users).set(patch).where(eq(users.id, row.id))
    if (attempts >= MAX_ATTEMPTS) {
      throw new AppError('account_locked', `密码错误次数过多，账户已锁定 ${LOCKOUT_MINUTES} 分钟`)
    }
    throw new AppError('invalid_credentials')
  }

  // Reset on success
  if (row.failedLoginAttempts > 0 || row.lockedUntil) {
    await db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, row.id))
  }
  return row
}

export function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    plan: row.plan,
    balance_usd: row.balanceUsd,
    limit_monthly_usd: row.limitMonthlyUsd,
    theme: row.theme,
    company: row.company,
    phone: row.phone,
    notify_email: row.notifyEmail,
    notify_browser: row.notifyBrowser,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}
