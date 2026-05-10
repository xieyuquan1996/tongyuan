ALTER TABLE upstream_keys ADD COLUMN IF NOT EXISTS admin_key_ciphertext text;
ALTER TABLE upstream_keys ADD COLUMN IF NOT EXISTS anthropic_key_id text;
