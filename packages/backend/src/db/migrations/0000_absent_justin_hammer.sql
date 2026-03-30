CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value_json" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" uuid,
	"details_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "benchmark_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"sample_size_per_category" integer DEFAULT 100 NOT NULL,
	"recency_window_days" integer DEFAULT 30 NOT NULL,
	"min_confidence" integer DEFAULT 50 NOT NULL,
	"sampling_mode" varchar(20) DEFAULT 'balanced' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "benchmark_run_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"indicator_id" uuid,
	"hostname" varchar(500) NOT NULL,
	"category" varchar(20) NOT NULL,
	"verdict" varchar(30),
	"latency_ms" integer,
	"evidence_json" jsonb,
	"tested_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "benchmark_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"probe_id" uuid,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"router_name" varchar(255),
	"firmware_version" varchar(100),
	"resolver_mode" varchar(255),
	"notes" text,
	"total_items" integer DEFAULT 0 NOT NULL,
	"completed_items" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "indicators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"hostname" varchar(500) NOT NULL,
	"registrable_domain" varchar(500),
	"full_url" text,
	"category" varchar(20) NOT NULL,
	"confidence" integer DEFAULT 50 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "probe_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"ip_address" varchar(45),
	"status" varchar(20) DEFAULT 'offline' NOT NULL,
	"concurrency_limit" integer DEFAULT 5 NOT NULL,
	"timeout_ms" integer DEFAULT 5000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "probe_agents_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scorecards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"malware_block_rate" real,
	"phishing_block_rate" real,
	"adult_filter_rate" real,
	"ads_tracker_block_rate" real,
	"clean_allow_rate" real,
	"consistency_score" real,
	"latency_penalty" real,
	"overall_score" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scorecards_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"status" varchar(20) NOT NULL,
	"records_fetched" integer DEFAULT 0 NOT NULL,
	"records_added" integer DEFAULT 0 NOT NULL,
	"records_skipped" integer DEFAULT 0 NOT NULL,
	"errors_json" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(20) NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"refresh_interval_mins" integer DEFAULT 360 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "benchmark_profiles" ADD CONSTRAINT "benchmark_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "benchmark_run_items" ADD CONSTRAINT "benchmark_run_items_run_id_benchmark_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."benchmark_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "benchmark_run_items" ADD CONSTRAINT "benchmark_run_items_indicator_id_indicators_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicators"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "benchmark_runs" ADD CONSTRAINT "benchmark_runs_profile_id_benchmark_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."benchmark_profiles"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "benchmark_runs" ADD CONSTRAINT "benchmark_runs_probe_id_probe_agents_id_fk" FOREIGN KEY ("probe_id") REFERENCES "public"."probe_agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "benchmark_runs" ADD CONSTRAINT "benchmark_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "indicators" ADD CONSTRAINT "indicators_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_run_id_benchmark_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."benchmark_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "source_sync_runs" ADD CONSTRAINT "source_sync_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_logs_created" ON "audit_logs" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_logs_entity" ON "audit_logs" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_run_items_run" ON "benchmark_run_items" ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_run_items_indicator" ON "benchmark_run_items" ("indicator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_benchmark_runs_status" ON "benchmark_runs" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_indicators_hostname_source" ON "indicators" ("hostname","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_indicators_hostname" ON "indicators" ("hostname");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_indicators_category_active" ON "indicators" ("category","is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_probe_agents_token" ON "probe_agents" ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_runs_source_started" ON "source_sync_runs" ("source_id","started_at");