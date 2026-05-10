CREATE TABLE IF NOT EXISTS reconciliation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upstream_key_id uuid NOT NULL REFERENCES upstream_keys(id) ON DELETE CASCADE,
  bucket_width text NOT NULL,
  bucket_at timestamp with time zone NOT NULL,
  local_input_tokens numeric,
  anthropic_input_tokens numeric,
  local_output_tokens numeric,
  anthropic_output_tokens numeric,
  local_cache_read_tokens numeric,
  anthropic_cache_read_tokens numeric,
  local_cache_write_tokens numeric,
  anthropic_cache_write_tokens numeric,
  local_cost_usd numeric(12,6),
  input_diff_pct numeric(8,4),
  output_diff_pct numeric(8,4),
  status text NOT NULL,
  ran_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_reports_key_width_bucket_idx
  ON reconciliation_reports(upstream_key_id, bucket_width, bucket_at);

CREATE INDEX IF NOT EXISTS reconciliation_reports_status_bucket_idx
  ON reconciliation_reports(status, bucket_at);
