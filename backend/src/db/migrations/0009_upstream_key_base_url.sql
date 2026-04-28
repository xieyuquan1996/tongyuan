-- Add per-key base URL so each upstream key can point to a different Anthropic-compatible endpoint.
-- Defaults to NULL which means "use ANTHROPIC_UPSTREAM_BASE_URL from env".
ALTER TABLE upstream_keys ADD COLUMN IF NOT EXISTS base_url text;
