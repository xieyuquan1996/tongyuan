-- Add charge_usd column to request_logs: stores the amount actually billed to
-- the user (cost_usd × (1 + markup_pct)), enabling per-request audit.
ALTER TABLE "request_logs" ADD COLUMN "charge_usd" numeric(12, 6) NOT NULL DEFAULT '0';

-- Indexes for common query patterns: listing keys/sessions per user,
-- and filtering request logs by user, key, or time range.
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "api_keys_user_id_idx" ON "api_keys" ("user_id");
CREATE INDEX IF NOT EXISTS "request_logs_user_id_idx" ON "request_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "request_logs_api_key_id_idx" ON "request_logs" ("api_key_id");
CREATE INDEX IF NOT EXISTS "request_logs_created_at_idx" ON "request_logs" ("created_at");
