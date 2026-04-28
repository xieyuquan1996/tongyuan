-- Seed default models with correct Anthropic dash-format IDs.
-- On conflict, do nothing so admin edits are preserved.
INSERT INTO models (id, display_name, context_window, input_price_usd_per_mtok, output_price_usd_per_mtok, enabled, recommended, note)
VALUES
  ('claude-opus-4-7',   'Claude Opus 4.7',   200000, 15.00, 75.00, true, true,  ''),
  ('claude-opus-4-6',   'Claude Opus 4.6',   200000,  3.00, 15.00, true, false, ''),
  ('claude-opus-4-5',   'Claude Opus 4.5',   200000,  3.00, 15.00, true, false, ''),
  ('claude-sonnet-4-6', 'Claude Sonnet 4.6', 200000,  3.00, 15.00, true, false, ''),
  ('claude-sonnet-4-5', 'Claude Sonnet 4.5', 200000,  3.00, 15.00, true, false, ''),
  ('claude-sonnet-4',   'Claude Sonnet 4',   200000,  3.00, 15.00, true, false, ''),
  ('claude-haiku-4-5',  'Claude Haiku 4.5',  200000,  0.80,  4.00, true, false, ''),
  ('claude-3-7-sonnet', 'Claude 3.7 Sonnet', 200000,  3.00, 15.00, true, false, '')
ON CONFLICT (id) DO NOTHING;

-- Remove legacy dot-format IDs if they still exist
DELETE FROM models WHERE id IN (
  'claude-opus-4.7', 'claude-opus-4.6', 'claude-opus-4.5',
  'claude-sonnet-4.6', 'claude-sonnet-4.5', 'claude-haiku-4.5',
  'claude-3.7-sonnet'
);
