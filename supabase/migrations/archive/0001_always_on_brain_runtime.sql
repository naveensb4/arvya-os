CREATE TYPE "public"."brain_alert_severity" AS ENUM('info', 'warning', 'error', 'critical');--> statement-breakpoint
CREATE TYPE "public"."brain_alert_status" AS ENUM('unread', 'read', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."connector_status" AS ENUM('active', 'paused', 'error');--> statement-breakpoint
CREATE TYPE "public"."connector_sync_run_status" AS ENUM('started', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."connector_type" AS ENUM('google_drive', 'gmail', 'outlook', 'recall', 'mock');--> statement-breakpoint
CREATE TABLE "brain_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"alert_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" "brain_alert_severity" DEFAULT 'info' NOT NULL,
	"source_id" uuid,
	"open_loop_id" uuid,
	"status" "brain_alert_status" DEFAULT 'unread' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"connector_type" "connector_type" NOT NULL,
	"status" "connector_status" DEFAULT 'active' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"credentials" jsonb,
	"sync_enabled" boolean DEFAULT false NOT NULL,
	"sync_interval_minutes" integer,
	"last_sync_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"connector_config_id" uuid,
	"connector_type" "connector_type" NOT NULL,
	"status" "connector_sync_run_status" DEFAULT 'started' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"items_found" integer DEFAULT 0 NOT NULL,
	"items_ingested" integer DEFAULT 0 NOT NULL,
	"items_skipped" integer DEFAULT 0 NOT NULL,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brain_alerts" ADD CONSTRAINT "brain_alerts_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_alerts" ADD CONSTRAINT "brain_alerts_source_id_source_items_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_alerts" ADD CONSTRAINT "brain_alerts_open_loop_id_open_loops_id_fk" FOREIGN KEY ("open_loop_id") REFERENCES "public"."open_loops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_configs" ADD CONSTRAINT "connector_configs_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_sync_runs" ADD CONSTRAINT "connector_sync_runs_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_sync_runs" ADD CONSTRAINT "connector_sync_runs_connector_config_id_connector_configs_id_fk" FOREIGN KEY ("connector_config_id") REFERENCES "public"."connector_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brain_alerts_brain_id_idx" ON "brain_alerts" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "brain_alerts_status_idx" ON "brain_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "brain_alerts_created_at_idx" ON "brain_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "connector_configs_brain_id_idx" ON "connector_configs" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "connector_configs_sync_enabled_idx" ON "connector_configs" USING btree ("sync_enabled");--> statement-breakpoint
CREATE INDEX "connector_sync_runs_brain_id_idx" ON "connector_sync_runs" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "connector_sync_runs_connector_config_id_idx" ON "connector_sync_runs" USING btree ("connector_config_id");--> statement-breakpoint
CREATE INDEX "connector_sync_runs_started_at_idx" ON "connector_sync_runs" USING btree ("started_at");
