CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('CAD', 'RMB')),
  usd_rmb_rate REAL,
  cad_usd_market_rate REAL,
  amount_cad REAL NOT NULL,
  note TEXT,
  category TEXT NOT NULL CHECK (category IN ('api_topup', 'user_payment', 'server', 'other')),
  tax REAL,
  bank_rate REAL,
  market_rate_at_purchase REAL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exchange_rate_cache (
  pair TEXT PRIMARY KEY,
  rate REAL NOT NULL,
  date TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

CREATE TRIGGER IF NOT EXISTS set_transactions_updated_at
AFTER UPDATE ON transactions
BEGIN
  UPDATE transactions SET updated_at = datetime('now') WHERE id = NEW.id;
END;
