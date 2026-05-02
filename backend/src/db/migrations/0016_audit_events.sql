-- Admin operation audit trail.
--
-- Every state-changing admin action (user suspend/adjust/role-change,
-- upstream-key add/revoke/cooldown reset, model CRUD, announcement CRUD,
-- settings update) writes one row here. Read-only browsing doesn't.
--
-- Design notes:
--   · actor_email is denormalized so the trail survives if the admin's
--     user row is later deleted. actor_user_id keeps a soft FK for joins.
--   · target is a short, human-readable identifier (the affected user's
--     email, the model id, the upstream key alias) — chosen for the
--     admin-Audit table column rather than for machine querying. The
--     metadata jsonb carries structured before/after diffs for forensics.
--   · `at` index covers the default "newest first" listing. action index
--     supports filter-by-action UI (e.g. "show me every balance adjust").

CREATE TABLE IF NOT EXISTS audit_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at            timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_email   text NOT NULL,
  action        text NOT NULL,
  target        text,
  note          text NOT NULL DEFAULT '',
  metadata      jsonb
);

CREATE INDEX IF NOT EXISTS audit_events_at_idx ON audit_events (at DESC);
CREATE INDEX IF NOT EXISTS audit_events_action_idx ON audit_events (action);
