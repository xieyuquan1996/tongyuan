// backend/src/db/schema.ts
import { pgTable, uuid, text, timestamp, numeric, boolean, integer, jsonb, index } from 'drizzle-orm/pg-core'

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
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
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
  // Legacy bcrypt hash. Kept nullable so newly minted keys can skip bcrypt
  // entirely; rows predating migration 0015 still have it filled in.
  secretHash: text('secret_hash'),
  // HMAC-SHA256(secret) under the per-deployment pepper. Indexed UNIQUE so
  // verify is one equality query.
  secretHmac: text('secret_hmac'),
  state: text('state').notNull().default('active'),
  rpmLimit: numeric('rpm_limit'),
  tpmLimit: numeric('tpm_limit'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})

export const models = pgTable('models', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  contextWindow: numeric('context_window').notNull().default('200000'),
  inputPriceUsdPerMtok: numeric('input_price_usd_per_mtok', { precision: 12, scale: 4 }).notNull().default('0'),
  outputPriceUsdPerMtok: numeric('output_price_usd_per_mtok', { precision: 12, scale: 4 }).notNull().default('0'),
  cacheReadPriceUsdPerMtok: numeric('cache_read_price_usd_per_mtok', { precision: 12, scale: 4 }),
  cacheWritePriceUsdPerMtok: numeric('cache_write_price_usd_per_mtok', { precision: 12, scale: 4 }),
  cacheWrite1hPriceUsdPerMtok: numeric('cache_write_1h_price_usd_per_mtok', { precision: 12, scale: 4 }),
  markupPct: numeric('markup_pct', { precision: 6, scale: 4 }).notNull().default('0'),
  enabled: boolean('enabled').notNull().default(true),
  recommended: boolean('recommended').notNull().default(false),
  note: text('note').notNull().default(''),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
})

export const requestLogs = pgTable('request_logs', {
  id: text('id').primaryKey(),                          // 'req_' + ulid
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  apiKeyId: uuid('api_key_id').notNull().references(() => apiKeys.id, { onDelete: 'set null' }),
  upstreamKeyId: uuid('upstream_key_id').references(() => upstreamKeys.id, { onDelete: 'set null' }),
  model: text('model').notNull(),
  upstreamModel: text('upstream_model').notNull(),
  endpoint: text('endpoint').notNull(),
  stream: boolean('stream').notNull().default(false),
  status: numeric('status').notNull(),
  errorCode: text('error_code'),
  latencyMs: numeric('latency_ms').notNull().default('0'),
  ttfbMs: numeric('ttfb_ms'),
  inputTokens: numeric('input_tokens').notNull().default('0'),
  outputTokens: numeric('output_tokens').notNull().default('0'),
  cacheReadTokens: numeric('cache_read_tokens').notNull().default('0'),
  cacheWriteTokens: numeric('cache_write_tokens').notNull().default('0'),
  cacheWrite1hTokens: numeric('cache_write_1h_tokens').notNull().default('0'),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
  requestHash: text('request_hash').notNull(),
  upstreamRequestHash: text('upstream_request_hash').notNull(),
  auditMatch: boolean('audit_match').notNull(),
  idempotencyKey: text('idempotency_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const billingLedger = pgTable('billing_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  requestLogId: text('request_log_id').references(() => requestLogs.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),                         // debit_usage | credit_signup | credit_admin_adjust
  amountUsd: numeric('amount_usd', { precision: 12, scale: 6 }).notNull(),
  balanceAfterUsd: numeric('balance_after_usd', { precision: 12, scale: 6 }).notNull(),
  note: text('note').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),        // 'balance_low' | 'spend_daily' | 'error_rate'
  threshold: text('threshold').notNull(),
  channel: text('channel').notNull(),  // 'email' | 'browser'
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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
  baseUrl: text('base_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  // Soft FK: keep the row even if the admin is deleted later.
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  // Snapshot the actor's email so audit listings survive user deletion.
  actorEmail: text('actor_email').notNull(),
  action: text('action').notNull(),         // e.g. 'admin.user.suspend'
  target: text('target'),                   // human-readable: email, model id, alias
  note: text('note').notNull().default(''),
  metadata: jsonb('metadata'),              // before/after diff or extra context
}, (t) => ({
  atIdx: index('audit_events_at_idx').on(t.at),
  actionIdx: index('audit_events_action_idx').on(t.action),
}))

export const announcements = pgTable('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  severity: text('severity').notNull().default('info'), // 'info' | 'warn' | 'err'
  pinned: boolean('pinned').notNull().default(false),
  visible: boolean('visible').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
})
