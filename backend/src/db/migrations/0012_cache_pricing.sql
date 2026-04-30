-- Split cache writes into 5m vs 1h buckets to match Anthropic's official
-- pricing table (5m = 1.25x base input, 1h = 2x base input, cache hits =
-- 0.1x base input). See https://platform.claude.com/docs/en/about-claude/pricing

ALTER TABLE models
  ADD COLUMN IF NOT EXISTS cache_write_1h_price_usd_per_mtok numeric(12, 4);

ALTER TABLE request_logs
  ADD COLUMN IF NOT EXISTS cache_write_1h_tokens numeric NOT NULL DEFAULT '0';

-- Backfill Anthropic's published prices on seeded rows. We touch only rows
-- whose prices still match the old generic defaults so admin overrides are
-- preserved. cache_write (5m) is base × 1.25, 1h is base × 2, read is base × 0.1.
UPDATE models SET
  input_price_usd_per_mtok           = 5.00,
  output_price_usd_per_mtok          = 25.00,
  cache_read_price_usd_per_mtok      = 0.50,
  cache_write_price_usd_per_mtok     = 6.25,
  cache_write_1h_price_usd_per_mtok  = 10.00
WHERE id IN ('claude-opus-4-7', 'claude-opus-4-6', 'claude-opus-4-5')
  AND (cache_write_1h_price_usd_per_mtok IS NULL OR cache_write_1h_price_usd_per_mtok = 0);

UPDATE models SET
  input_price_usd_per_mtok           = 15.00,
  output_price_usd_per_mtok          = 75.00,
  cache_read_price_usd_per_mtok      = 1.50,
  cache_write_price_usd_per_mtok     = 18.75,
  cache_write_1h_price_usd_per_mtok  = 30.00
WHERE id IN ('claude-opus-4-1', 'claude-opus-4')
  AND (cache_write_1h_price_usd_per_mtok IS NULL OR cache_write_1h_price_usd_per_mtok = 0);

UPDATE models SET
  input_price_usd_per_mtok           = 3.00,
  output_price_usd_per_mtok          = 15.00,
  cache_read_price_usd_per_mtok      = 0.30,
  cache_write_price_usd_per_mtok     = 3.75,
  cache_write_1h_price_usd_per_mtok  = 6.00
WHERE id IN ('claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-sonnet-4', 'claude-3-7-sonnet')
  AND (cache_write_1h_price_usd_per_mtok IS NULL OR cache_write_1h_price_usd_per_mtok = 0);

UPDATE models SET
  input_price_usd_per_mtok           = 1.00,
  output_price_usd_per_mtok          = 5.00,
  cache_read_price_usd_per_mtok      = 0.10,
  cache_write_price_usd_per_mtok     = 1.25,
  cache_write_1h_price_usd_per_mtok  = 2.00
WHERE id = 'claude-haiku-4-5'
  AND (cache_write_1h_price_usd_per_mtok IS NULL OR cache_write_1h_price_usd_per_mtok = 0);

-- Haiku 3.5 (if admin has added it)
UPDATE models SET
  input_price_usd_per_mtok           = 0.80,
  output_price_usd_per_mtok          = 4.00,
  cache_read_price_usd_per_mtok      = 0.08,
  cache_write_price_usd_per_mtok     = 1.00,
  cache_write_1h_price_usd_per_mtok  = 1.60
WHERE id = 'claude-3-5-haiku'
  AND (cache_write_1h_price_usd_per_mtok IS NULL OR cache_write_1h_price_usd_per_mtok = 0);
