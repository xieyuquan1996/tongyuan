-- Seed the remaining models from Anthropic's official pricing table that
-- weren't in 0008. IDs use dash-format to match the existing seed. Prices
-- come straight from https://platform.claude.com/docs/en/about-claude/pricing
--
-- On conflict we DO NOTHING: admins who already added these manually keep
-- their overrides. We do NOT touch the rows from 0012 — those are already
-- correct for current models.

INSERT INTO models (
  id, display_name, context_window,
  input_price_usd_per_mtok, output_price_usd_per_mtok,
  cache_read_price_usd_per_mtok, cache_write_price_usd_per_mtok, cache_write_1h_price_usd_per_mtok,
  enabled, recommended, note
) VALUES
  ('claude-opus-4-1', 'Claude Opus 4.1', 200000,
    15.00, 75.00, 1.50, 18.75, 30.00,
    true, false, ''),
  ('claude-opus-4',   'Claude Opus 4',   200000,
    15.00, 75.00, 1.50, 18.75, 30.00,
    true, false, ''),
  ('claude-3-5-haiku', 'Claude Haiku 3.5', 200000,
    0.80, 4.00, 0.08, 1.00, 1.60,
    true, false, ''),
  ('claude-3-opus', 'Claude Opus 3', 200000,
    15.00, 75.00, 1.50, 18.75, 30.00,
    false, false, 'deprecated'),
  ('claude-3-haiku', 'Claude Haiku 3', 200000,
    0.25, 1.25, 0.03, 0.30, 0.50,
    false, false, '')
ON CONFLICT (id) DO NOTHING;
