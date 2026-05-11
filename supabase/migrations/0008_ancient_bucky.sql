CREATE TYPE "public"."brain_alert_severity" AS ENUM('info', 'warning', 'error', 'critical');--> statement-breakpoint
CREATE TYPE "public"."brain_alert_status" AS ENUM('unread', 'read', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."connector_status" AS ENUM('active', 'connected', 'paused', 'error');--> statement-breakpoint
CREATE TYPE "public"."connector_sync_run_status" AS ENUM('started', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."connector_type" AS ENUM('google_drive', 'gmail', 'outlook', 'recall', 'mock');--> statement-breakpoint
CREATE TYPE "public"."marketing_attribution_confidence" AS ENUM('direct', 'assisted', 'manual', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."marketing_channel" AS ENUM('linkedin_company', 'x', 'linkedin_founder', 'linkedin_pb');--> statement-breakpoint
CREATE TYPE "public"."marketing_confidentiality" AS ENUM('public', 'internal', 'customer_sensitive', 'investor_sensitive', 'confidential');--> statement-breakpoint
CREATE TYPE "public"."marketing_event_type" AS ENUM('demo', 'dm', 'reply', 'qualified_lead', 'website_visit', 'manual_attribution');--> statement-breakpoint
CREATE TYPE "public"."marketing_experiment_status" AS ENUM('planned', 'running', 'completed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."marketing_format_type" AS ENUM('teardown', 'founder_story', 'list', 'contrarian', 'product_pov', 'case_study', 'memo', 'other');--> statement-breakpoint
CREATE TYPE "public"."marketing_funnel_stage" AS ENUM('awareness', 'problem_aware', 'solution_aware', 'conversion');--> statement-breakpoint
CREATE TYPE "public"."marketing_hook_type" AS ENUM('pain', 'insight', 'mistake', 'lesson', 'workflow', 'future_of_work', 'other');--> statement-breakpoint
CREATE TYPE "public"."marketing_post_status" AS ENUM('draft', 'needs_revision', 'approved', 'scheduled', 'published', 'archived', 'failed_schedule');--> statement-breakpoint
CREATE TYPE "public"."marketing_sensitivity_level" AS ENUM('low', 'medium', 'high', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."marketing_source_platform" AS ENUM('google_drive', 'manual', 'slack', 'gmail', 'outlook', 'voice', 'blog');--> statement-breakpoint
CREATE TYPE "public"."marketing_source_type" AS ENUM('google_drive_transcript', 'manual_note', 'voice_note', 'slack_thread', 'gmail_email', 'outlook_email', 'blog', 'demo_form', 'investor_question', 'customer_objection', 'product_update');--> statement-breakpoint
CREATE TYPE "public"."marketing_target_icp" AS ENUM('ib', 'pe', 'hf', 'investor', 'founder', 'operator', 'other');--> statement-breakpoint
CREATE TYPE "public"."notetaker_auto_join_decision" AS ENUM('join', 'skip', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."notetaker_auto_join_mode" AS ENUM('all_calls', 'external_only', 'arvya_related_only', 'manual_only');--> statement-breakpoint
CREATE TYPE "public"."notetaker_bot_status" AS ENUM('not_scheduled', 'scheduled', 'joining', 'in_call', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."notetaker_calendar_status" AS ENUM('connected', 'error', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."notetaker_provider" AS ENUM('google_calendar', 'outlook_calendar');--> statement-breakpoint
CREATE TYPE "public"."priority_horizon" AS ENUM('today', 'week', 'sprint', 'quarter');--> statement-breakpoint
CREATE TYPE "public"."priority_set_by" AS ENUM('naveen', 'pb', 'system');--> statement-breakpoint
CREATE TYPE "public"."priority_status" AS ENUM('active', 'achieved', 'abandoned');--> statement-breakpoint
ALTER TYPE "public"."memory_kind" ADD VALUE 'outcome' BEFORE 'custom';--> statement-breakpoint
ALTER TYPE "public"."memory_kind" ADD VALUE 'investor_feedback' BEFORE 'custom';--> statement-breakpoint
ALTER TYPE "public"."memory_kind" ADD VALUE 'customer_feedback' BEFORE 'custom';--> statement-breakpoint
ALTER TYPE "public"."memory_kind" ADD VALUE 'advisor_feedback' BEFORE 'custom';--> statement-breakpoint
ALTER TYPE "public"."open_loop_status" ADD VALUE 'needs_review' BEFORE 'open';--> statement-breakpoint
ALTER TYPE "public"."open_loop_status" ADD VALUE 'dismissed' BEFORE 'closed';--> statement-breakpoint
ALTER TYPE "public"."open_loop_type" ADD VALUE 'task' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."open_loop_type" ADD VALUE 'investor_ask' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."open_loop_type" ADD VALUE 'customer_ask' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."open_loop_type" ADD VALUE 'strategic_question' BEFORE 'other';--> statement-breakpoint
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
CREATE TABLE "marketing_channel_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"content_item_id" uuid,
	"content_insight_id" uuid,
	"channel" "marketing_channel" NOT NULL,
	"status" "marketing_post_status" DEFAULT 'draft' NOT NULL,
	"body_text" text NOT NULL,
	"media_type" text,
	"media_reference" text,
	"planned_post_date" timestamp with time zone,
	"posting_window" text,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"live_url" text,
	"scheduler_provider" text,
	"scheduler_post_id" text,
	"campaign_tag" text,
	"pillar" text,
	"format_type" "marketing_format_type",
	"hook_type" "marketing_hook_type",
	"target_icp" "marketing_target_icp",
	"funnel_stage" "marketing_funnel_stage",
	"experiment_tag" text,
	"requires_review" boolean DEFAULT true NOT NULL,
	"sensitivity_level" "marketing_sensitivity_level" DEFAULT 'medium' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"revision_reason" text,
	"safety_check_status" text DEFAULT 'not_run' NOT NULL,
	"safety_check_reason" text,
	"is_exemplar" boolean DEFAULT false NOT NULL,
	"performance_tag" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_content_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"raw_insight" text NOT NULL,
	"content_safe_insight" text NOT NULL,
	"sensitivity_level" "marketing_sensitivity_level" DEFAULT 'medium' NOT NULL,
	"suggested_pillar" text,
	"suggested_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved_for_content" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"source_item_id" uuid,
	"source_platform" "marketing_source_platform" NOT NULL,
	"source_type" "marketing_source_type" NOT NULL,
	"source_url" text,
	"source_external_id" text,
	"source_owner" text,
	"source_date" timestamp with time zone,
	"source_confidentiality" "marketing_confidentiality" DEFAULT 'internal' NOT NULL,
	"raw_text" text NOT NULL,
	"cleaned_summary" text,
	"content_safe_summary" text,
	"requires_redaction" boolean DEFAULT true NOT NULL,
	"approved_for_content" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"channel_post_id" uuid,
	"event_type" "marketing_event_type" NOT NULL,
	"event_source" text NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"contact_name" text,
	"company_name" text,
	"value" numeric(12, 2),
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"attribution_confidence" "marketing_attribution_confidence" DEFAULT 'unknown' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"title" text NOT NULL,
	"hypothesis" text NOT NULL,
	"status" "marketing_experiment_status" DEFAULT 'planned' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_llm_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"model_provider" "model_provider" DEFAULT 'local' NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_post_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"channel_post_id" uuid NOT NULL,
	"metric_date" timestamp with time zone NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"reactions" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"follows" integer DEFAULT 0 NOT NULL,
	"raw_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_weekly_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"week_end" timestamp with time zone NOT NULL,
	"published_count" integer DEFAULT 0 NOT NULL,
	"qualitative_only" boolean DEFAULT true NOT NULL,
	"summary" text NOT NULL,
	"markdown" text NOT NULL,
	"recommended_experiments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notetaker_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"user_id" text,
	"provider" "notetaker_provider" NOT NULL,
	"recall_calendar_id" text,
	"external_calendar_id" text,
	"status" "notetaker_calendar_status" DEFAULT 'connected' NOT NULL,
	"auto_join_enabled" boolean DEFAULT true NOT NULL,
	"auto_join_mode" "notetaker_auto_join_mode" DEFAULT 'all_calls' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notetaker_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"notetaker_meeting_id" uuid,
	"provider_event_id" text,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notetaker_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"notetaker_calendar_id" uuid,
	"recall_calendar_event_id" text,
	"recall_bot_id" text,
	"external_event_id" text,
	"provider" "notetaker_provider" NOT NULL,
	"title" text NOT NULL,
	"meeting_url" text,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_join_decision" "notetaker_auto_join_decision" DEFAULT 'needs_review' NOT NULL,
	"auto_join_reason" text,
	"bot_status" "notetaker_bot_status" DEFAULT 'not_scheduled' NOT NULL,
	"source_item_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "priorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"statement" text NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	"set_by" "priority_set_by" DEFAULT 'naveen' NOT NULL,
	"horizon" "priority_horizon" DEFAULT 'week' NOT NULL,
	"status" "priority_status" DEFAULT 'active' NOT NULL,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "open_loops" ALTER COLUMN "status" SET DEFAULT 'needs_review';--> statement-breakpoint
ALTER TABLE "brain_alerts" ADD CONSTRAINT "brain_alerts_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_alerts" ADD CONSTRAINT "brain_alerts_source_id_source_items_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_alerts" ADD CONSTRAINT "brain_alerts_open_loop_id_open_loops_id_fk" FOREIGN KEY ("open_loop_id") REFERENCES "public"."open_loops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_configs" ADD CONSTRAINT "connector_configs_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_sync_runs" ADD CONSTRAINT "connector_sync_runs_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_sync_runs" ADD CONSTRAINT "connector_sync_runs_connector_config_id_connector_configs_id_fk" FOREIGN KEY ("connector_config_id") REFERENCES "public"."connector_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_channel_posts" ADD CONSTRAINT "marketing_channel_posts_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_channel_posts" ADD CONSTRAINT "marketing_channel_posts_content_item_id_marketing_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."marketing_content_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_channel_posts" ADD CONSTRAINT "marketing_channel_posts_content_insight_id_marketing_content_insights_id_fk" FOREIGN KEY ("content_insight_id") REFERENCES "public"."marketing_content_insights"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_content_insights" ADD CONSTRAINT "marketing_content_insights_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_content_insights" ADD CONSTRAINT "marketing_content_insights_content_item_id_marketing_content_items_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."marketing_content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_content_items" ADD CONSTRAINT "marketing_content_items_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_content_items" ADD CONSTRAINT "marketing_content_items_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_events" ADD CONSTRAINT "marketing_events_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_events" ADD CONSTRAINT "marketing_events_channel_post_id_marketing_channel_posts_id_fk" FOREIGN KEY ("channel_post_id") REFERENCES "public"."marketing_channel_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_experiments" ADD CONSTRAINT "marketing_experiments_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_llm_usage" ADD CONSTRAINT "marketing_llm_usage_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_post_metrics" ADD CONSTRAINT "marketing_post_metrics_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_post_metrics" ADD CONSTRAINT "marketing_post_metrics_channel_post_id_marketing_channel_posts_id_fk" FOREIGN KEY ("channel_post_id") REFERENCES "public"."marketing_channel_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_weekly_reports" ADD CONSTRAINT "marketing_weekly_reports_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notetaker_calendars" ADD CONSTRAINT "notetaker_calendars_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notetaker_events" ADD CONSTRAINT "notetaker_events_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notetaker_events" ADD CONSTRAINT "notetaker_events_notetaker_meeting_id_notetaker_meetings_id_fk" FOREIGN KEY ("notetaker_meeting_id") REFERENCES "public"."notetaker_meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notetaker_meetings" ADD CONSTRAINT "notetaker_meetings_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notetaker_meetings" ADD CONSTRAINT "notetaker_meetings_notetaker_calendar_id_notetaker_calendars_id_fk" FOREIGN KEY ("notetaker_calendar_id") REFERENCES "public"."notetaker_calendars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notetaker_meetings" ADD CONSTRAINT "notetaker_meetings_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priorities" ADD CONSTRAINT "priorities_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brain_alerts_brain_id_idx" ON "brain_alerts" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "brain_alerts_status_idx" ON "brain_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "brain_alerts_created_at_idx" ON "brain_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "connector_configs_brain_id_idx" ON "connector_configs" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "connector_configs_sync_enabled_idx" ON "connector_configs" USING btree ("sync_enabled");--> statement-breakpoint
CREATE INDEX "connector_sync_runs_brain_id_idx" ON "connector_sync_runs" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "connector_sync_runs_connector_config_id_idx" ON "connector_sync_runs" USING btree ("connector_config_id");--> statement-breakpoint
CREATE INDEX "connector_sync_runs_started_at_idx" ON "connector_sync_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "marketing_channel_posts_brain_id_idx" ON "marketing_channel_posts" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "marketing_channel_posts_item_id_idx" ON "marketing_channel_posts" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX "marketing_channel_posts_insight_id_idx" ON "marketing_channel_posts" USING btree ("content_insight_id");--> statement-breakpoint
CREATE INDEX "marketing_channel_posts_status_idx" ON "marketing_channel_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "marketing_channel_posts_scheduled_idx" ON "marketing_channel_posts" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "marketing_channel_posts_scheduler_idx" ON "marketing_channel_posts" USING btree ("scheduler_provider","scheduler_post_id");--> statement-breakpoint
CREATE INDEX "marketing_content_insights_brain_id_idx" ON "marketing_content_insights" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "marketing_content_insights_item_id_idx" ON "marketing_content_insights" USING btree ("content_item_id");--> statement-breakpoint
CREATE INDEX "marketing_content_insights_approved_idx" ON "marketing_content_insights" USING btree ("approved_for_content");--> statement-breakpoint
CREATE INDEX "marketing_content_items_brain_id_idx" ON "marketing_content_items" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "marketing_content_items_source_item_id_idx" ON "marketing_content_items" USING btree ("source_item_id");--> statement-breakpoint
CREATE INDEX "marketing_content_items_external_id_idx" ON "marketing_content_items" USING btree ("source_platform","source_external_id");--> statement-breakpoint
CREATE INDEX "marketing_content_items_created_at_idx" ON "marketing_content_items" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "marketing_events_brain_id_idx" ON "marketing_events" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "marketing_events_post_id_idx" ON "marketing_events" USING btree ("channel_post_id");--> statement-breakpoint
CREATE INDEX "marketing_events_type_idx" ON "marketing_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "marketing_events_at_idx" ON "marketing_events" USING btree ("event_at");--> statement-breakpoint
CREATE INDEX "marketing_experiments_brain_id_idx" ON "marketing_experiments" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "marketing_experiments_tag_idx" ON "marketing_experiments" USING btree ("brain_id","tag");--> statement-breakpoint
CREATE INDEX "marketing_llm_usage_brain_id_idx" ON "marketing_llm_usage" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "marketing_llm_usage_created_at_idx" ON "marketing_llm_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "marketing_post_metrics_brain_id_idx" ON "marketing_post_metrics" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "marketing_post_metrics_post_id_idx" ON "marketing_post_metrics" USING btree ("channel_post_id");--> statement-breakpoint
CREATE INDEX "marketing_post_metrics_date_idx" ON "marketing_post_metrics" USING btree ("metric_date");--> statement-breakpoint
CREATE INDEX "marketing_weekly_reports_brain_id_idx" ON "marketing_weekly_reports" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "marketing_weekly_reports_week_idx" ON "marketing_weekly_reports" USING btree ("brain_id","week_start","week_end");--> statement-breakpoint
CREATE INDEX "notetaker_calendars_brain_id_idx" ON "notetaker_calendars" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "notetaker_calendars_recall_calendar_id_idx" ON "notetaker_calendars" USING btree ("recall_calendar_id");--> statement-breakpoint
CREATE INDEX "notetaker_calendars_external_calendar_id_idx" ON "notetaker_calendars" USING btree ("external_calendar_id");--> statement-breakpoint
CREATE INDEX "notetaker_events_brain_id_idx" ON "notetaker_events" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "notetaker_events_meeting_id_idx" ON "notetaker_events" USING btree ("notetaker_meeting_id");--> statement-breakpoint
CREATE INDEX "notetaker_events_provider_event_id_idx" ON "notetaker_events" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "notetaker_events_type_idx" ON "notetaker_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "notetaker_meetings_brain_id_idx" ON "notetaker_meetings" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "notetaker_meetings_calendar_id_idx" ON "notetaker_meetings" USING btree ("notetaker_calendar_id");--> statement-breakpoint
CREATE INDEX "notetaker_meetings_recall_event_id_idx" ON "notetaker_meetings" USING btree ("recall_calendar_event_id");--> statement-breakpoint
CREATE INDEX "notetaker_meetings_recall_bot_id_idx" ON "notetaker_meetings" USING btree ("recall_bot_id");--> statement-breakpoint
CREATE INDEX "notetaker_meetings_external_event_id_idx" ON "notetaker_meetings" USING btree ("external_event_id");--> statement-breakpoint
CREATE INDEX "notetaker_meetings_start_time_idx" ON "notetaker_meetings" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "notetaker_meetings_source_item_id_idx" ON "notetaker_meetings" USING btree ("source_item_id");--> statement-breakpoint
CREATE INDEX "priorities_brain_id_idx" ON "priorities" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "priorities_brain_status_idx" ON "priorities" USING btree ("brain_id","status");--> statement-breakpoint
CREATE INDEX "priorities_status_idx" ON "priorities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "priorities_set_at_idx" ON "priorities" USING btree ("set_at");--> statement-breakpoint
CREATE INDEX "agent_runs_brain_started_at_idx" ON "agent_runs" USING btree ("brain_id","started_at");--> statement-breakpoint
CREATE INDEX "memory_objects_brain_created_at_idx" ON "memory_objects" USING btree ("brain_id","created_at");--> statement-breakpoint
CREATE INDEX "open_loops_brain_created_at_idx" ON "open_loops" USING btree ("brain_id","created_at");--> statement-breakpoint
CREATE INDEX "relationships_brain_created_at_idx" ON "relationships" USING btree ("brain_id","created_at");--> statement-breakpoint
CREATE INDEX "source_items_brain_created_at_idx" ON "source_items" USING btree ("brain_id","created_at");--> statement-breakpoint
CREATE INDEX "workflows_brain_created_at_idx" ON "workflows" USING btree ("brain_id","created_at");