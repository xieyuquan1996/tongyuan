ALTER TABLE users ADD COLUMN IF NOT EXISTS webhook_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS webhook_token text;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS webhook_url text;
