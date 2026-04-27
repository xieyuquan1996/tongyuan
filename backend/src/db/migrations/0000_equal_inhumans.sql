CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"plan" text DEFAULT 'Starter' NOT NULL,
	"balance_usd" numeric(12, 6) DEFAULT '10.000000' NOT NULL,
	"limit_monthly_usd" numeric(12, 6),
	"theme" text DEFAULT 'light' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"notify_email" boolean DEFAULT true NOT NULL,
	"notify_browser" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
