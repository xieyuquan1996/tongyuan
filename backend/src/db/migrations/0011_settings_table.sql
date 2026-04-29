-- Generic key/value settings table. Seed the default exchange rate.
CREATE TABLE IF NOT EXISTS settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES ('usd_to_cny', '7.20') ON CONFLICT DO NOTHING;
