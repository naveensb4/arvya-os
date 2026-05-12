CREATE TABLE "brain_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brain_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "source_system" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brain_events" ADD CONSTRAINT "brain_events_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "brain_events_brain_id_idx" ON "brain_events" USING btree ("brain_id");
--> statement-breakpoint
CREATE INDEX "brain_events_type_idx" ON "brain_events" USING btree ("event_type");
--> statement-breakpoint
CREATE INDEX "brain_events_source_system_idx" ON "brain_events" USING btree ("source_system");
--> statement-breakpoint
CREATE INDEX "brain_events_created_at_idx" ON "brain_events" USING btree ("created_at");
