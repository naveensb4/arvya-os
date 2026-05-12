CREATE TYPE "notetaker_provider" AS ENUM('google_calendar', 'outlook_calendar');
CREATE TYPE "notetaker_calendar_status" AS ENUM('connected', 'error', 'disabled');
CREATE TYPE "notetaker_auto_join_mode" AS ENUM('all_calls', 'external_only', 'arvya_related_only', 'manual_only');
CREATE TYPE "notetaker_auto_join_decision" AS ENUM('join', 'skip', 'needs_review');
CREATE TYPE "notetaker_bot_status" AS ENUM('not_scheduled', 'scheduled', 'joining', 'in_call', 'completed', 'failed', 'canceled');

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

ALTER TABLE "notetaker_calendars" ADD CONSTRAINT "notetaker_calendars_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "notetaker_meetings" ADD CONSTRAINT "notetaker_meetings_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "notetaker_meetings" ADD CONSTRAINT "notetaker_meetings_notetaker_calendar_id_notetaker_calendars_id_fk" FOREIGN KEY ("notetaker_calendar_id") REFERENCES "public"."notetaker_calendars"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "notetaker_meetings" ADD CONSTRAINT "notetaker_meetings_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "notetaker_events" ADD CONSTRAINT "notetaker_events_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "notetaker_events" ADD CONSTRAINT "notetaker_events_notetaker_meeting_id_notetaker_meetings_id_fk" FOREIGN KEY ("notetaker_meeting_id") REFERENCES "public"."notetaker_meetings"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX "notetaker_calendars_brain_id_idx" ON "notetaker_calendars" USING btree ("brain_id");
CREATE INDEX "notetaker_calendars_recall_calendar_id_idx" ON "notetaker_calendars" USING btree ("recall_calendar_id");
CREATE INDEX "notetaker_calendars_external_calendar_id_idx" ON "notetaker_calendars" USING btree ("external_calendar_id");
CREATE INDEX "notetaker_meetings_brain_id_idx" ON "notetaker_meetings" USING btree ("brain_id");
CREATE INDEX "notetaker_meetings_calendar_id_idx" ON "notetaker_meetings" USING btree ("notetaker_calendar_id");
CREATE INDEX "notetaker_meetings_recall_event_id_idx" ON "notetaker_meetings" USING btree ("recall_calendar_event_id");
CREATE INDEX "notetaker_meetings_recall_bot_id_idx" ON "notetaker_meetings" USING btree ("recall_bot_id");
CREATE INDEX "notetaker_meetings_external_event_id_idx" ON "notetaker_meetings" USING btree ("external_event_id");
CREATE INDEX "notetaker_meetings_start_time_idx" ON "notetaker_meetings" USING btree ("start_time");
CREATE INDEX "notetaker_meetings_source_item_id_idx" ON "notetaker_meetings" USING btree ("source_item_id");
CREATE INDEX "notetaker_events_brain_id_idx" ON "notetaker_events" USING btree ("brain_id");
CREATE INDEX "notetaker_events_meeting_id_idx" ON "notetaker_events" USING btree ("notetaker_meeting_id");
CREATE INDEX "notetaker_events_provider_event_id_idx" ON "notetaker_events" USING btree ("provider_event_id");
CREATE INDEX "notetaker_events_type_idx" ON "notetaker_events" USING btree ("event_type");
