CREATE TABLE IF NOT EXISTS "upstream_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alias" text NOT NULL,
	"provider" text DEFAULT 'anthropic_official' NOT NULL,
	"key_ciphertext" text NOT NULL,
	"key_prefix" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"priority" numeric DEFAULT '100' NOT NULL,
	"cooldown_until" timestamp with time zone,
	"last_error_code" text,
	"last_error_at" timestamp with time zone,
	"quota_hint_usd" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
