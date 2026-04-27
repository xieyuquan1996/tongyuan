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

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  secretHash: text('secret_hash').notNull(),
  state: text('state').notNull().default('active'),
  rpmLimit: numeric('rpm_limit'),
  tpmLimit: numeric('tpm_limit'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})

export const upstreamKeys = pgTable('upstream_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  alias: text('alias').notNull(),
  provider: text('provider').notNull().default('anthropic_official'),
  keyCiphertext: text('key_ciphertext').notNull(),   // base64
  keyPrefix: text('key_prefix').notNull(),
  state: text('state').notNull().default('active'),  // 'active' | 'cooldown' | 'disabled'
  priority: numeric('priority').notNull().default('100'),
  cooldownUntil: timestamp('cooldown_until', { withTimezone: true }),
  lastErrorCode: text('last_error_code'),
  lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
  quotaHintUsd: numeric('quota_hint_usd', { precision: 12, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
