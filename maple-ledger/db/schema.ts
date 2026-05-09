import { sqliteTable, text, real } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['income', 'expense'] }).notNull(),
  date: text('date').notNull(),
  amount: real('amount').notNull(),
  currency: text('currency', { enum: ['CAD', 'RMB'] }).notNull(),
  usdRmbRate: real('usd_rmb_rate'),
  cadUsdMarketRate: real('cad_usd_market_rate'),
  amountCad: real('amount_cad').notNull(),
  note: text('note'),
  category: text('category', { enum: ['api_topup', 'user_payment', 'server', 'other'] }).notNull(),
  tax: real('tax'),
  bankRate: real('bank_rate'),
  marketRateAtPurchase: real('market_rate_at_purchase'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`).notNull(),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`).notNull(),
})

export const exchangeRateCache = sqliteTable('exchange_rate_cache', {
  pair: text('pair').primaryKey(),
  rate: real('rate').notNull(),
  date: text('date').notNull(),
  fetchedAt: text('fetched_at').default(sql`(datetime('now'))`).notNull(),
})
