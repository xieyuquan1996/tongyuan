// backend/src/db/schema.ts
import { pgTable, uuid, text, timestamp, numeric, boolean } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull().default(''),
  role: text('role').notNull().default('user'),
  status: text('status').notNull().default('active'),
  plan: text('plan').notNull().default('Starter'),
  balanceUsd: numeric('balance_usd', { precision: 12, scale: 6 }).notNull().default('10.000000'),
  limitMonthlyUsd: numeric('limit_monthly_usd', { precision: 12, scale: 6 }),
  theme: text('theme').notNull().default('light'),
  company: text('company').notNull().default(''),
  phone: text('phone').notNull().default(''),
  notifyEmail: boolean('notify_email').notNull().default(true),
  notifyBrowser: boolean('notify_browser').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
