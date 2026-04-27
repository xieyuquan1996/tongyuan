CREATE TABLE IF NOT EXISTS "billing_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"request_log_id" text,
	"kind" text NOT NULL,
	"amount_usd" numeric(12, 6) NOT NULL,
	"balance_after_usd" numeric(12, 6) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "request_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"api_key_id" uuid NOT NULL,
	"upstream_key_id" uuid,
	"model" text NOT NULL,
	"upstream_model" text NOT NULL,
	"endpoint" text NOT NULL,
	"stream" boolean DEFAULT false NOT NULL,
	"status" numeric NOT NULL,
	"error_code" text,
	"latency_ms" numeric DEFAULT '0' NOT NULL,
	"ttfb_ms" numeric,
	"input_tokens" numeric DEFAULT '0' NOT NULL,
	"output_tokens" numeric DEFAULT '0' NOT NULL,
	"cache_read_tokens" numeric DEFAULT '0' NOT NULL,
	"cache_write_tokens" numeric DEFAULT '0' NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"request_hash" text NOT NULL,
	"upstream_request_hash" text NOT NULL,
	"audit_match" boolean NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_ledger" ADD CONSTRAINT "billing_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_ledger" ADD CONSTRAINT "billing_ledger_request_log_id_request_logs_id_fk" FOREIGN KEY ("request_log_id") REFERENCES "public"."request_logs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_upstream_key_id_upstream_keys_id_fk" FOREIGN KEY ("upstream_key_id") REFERENCES "public"."upstream_keys"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
