CREATE TABLE IF NOT EXISTS "models" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"context_window" numeric DEFAULT '200000' NOT NULL,
	"input_price_usd_per_mtok" numeric(12, 4) DEFAULT '0' NOT NULL,
	"output_price_usd_per_mtok" numeric(12, 4) DEFAULT '0' NOT NULL,
	"cache_read_price_usd_per_mtok" numeric(12, 4),
	"cache_write_price_usd_per_mtok" numeric(12, 4),
	"markup_pct" numeric(6, 4) DEFAULT '0' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"recommended" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
