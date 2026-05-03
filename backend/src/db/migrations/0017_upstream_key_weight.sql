-- Add weight column for weighted-random load balancing across upstream keys.
-- Higher weight = larger share of traffic. Default 100 gives equal balance
-- for existing rows.
ALTER TABLE upstream_keys ADD COLUMN IF NOT EXISTS weight integer NOT NULL DEFAULT 100;
