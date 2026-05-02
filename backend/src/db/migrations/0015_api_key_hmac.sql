-- Switch API key verification from bcrypt(secret) to HMAC-SHA256(secret).
-- Bcrypt was costing one bcrypt.compare per row that shared the prefix on
-- every request — fine for a few users, painful at scale and especially
-- under the rate limiter's hot path. HMAC over the full 80-char random
-- secret is preimage-resistant (the secret itself is high entropy, so we
-- don't need bcrypt's cost factor) and lets us hit the row with a single
-- equality query.
--
-- Migration strategy: add the column nullable + indexed; loosen secret_hash
-- to nullable so future inserts can skip bcrypt entirely. Existing rows
-- keep their bcrypt hash and get their secret_hmac filled in lazily on the
-- next successful verification (handled in services/api-keys.ts).

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS secret_hmac text;
ALTER TABLE api_keys ALTER COLUMN secret_hash DROP NOT NULL;

-- Unique index: an HMAC collision would either be a bug or a key reuse.
-- Partial index keeps NULLs out of uniqueness checks so legacy rows stay valid.
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_secret_hmac_uq
  ON api_keys (secret_hmac)
  WHERE secret_hmac IS NOT NULL;
