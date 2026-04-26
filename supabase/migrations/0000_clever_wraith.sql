CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."brain_kind" AS ENUM('company', 'sell_side', 'buy_side');--> statement-breakpoint
CREATE TYPE "public"."memory_kind" AS ENUM('person', 'company', 'fact', 'event', 'decision', 'insight', 'risk', 'question', 'commitment', 'task', 'product_insight', 'marketing_idea', 'custom');--> statement-breakpoint
CREATE TYPE "public"."memory_status" AS ENUM('open', 'in_progress', 'waiting', 'done', 'closed', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."model_provider" AS ENUM('local', 'anthropic', 'openai');--> statement-breakpoint
CREATE TYPE "public"."open_loop_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."open_loop_status" AS ENUM('open', 'in_progress', 'waiting', 'done', 'closed');--> statement-breakpoint
CREATE TYPE "public"."open_loop_type" AS ENUM('follow_up', 'intro', 'product', 'investor', 'sales', 'marketing', 'engineering', 'deal', 'diligence', 'crm', 'scheduling', 'other');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('transcript', 'email', 'note', 'document', 'github', 'strategy_output', 'web', 'manual');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('started', 'running', 'waiting_for_human', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"source_item_id" uuid,
	"workflow_id" uuid,
	"name" text NOT NULL,
	"status" "agent_run_status" DEFAULT 'queued' NOT NULL,
	"model_provider" "model_provider" DEFAULT 'local' NOT NULL,
	"step_name" text,
	"input_summary" text DEFAULT '' NOT NULL,
	"output_summary" text DEFAULT '' NOT NULL,
	"raw_input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "brain_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "brain_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"thesis_starter" text DEFAULT '' NOT NULL,
	"default_source_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_workflows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"memory_lens_order" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "brain_kind" DEFAULT 'company' NOT NULL,
	"thesis" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"source_item_id" uuid,
	"object_type" "memory_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_quote" text,
	"confidence" numeric(3, 2),
	"status" "memory_status",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_loops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"source_item_id" uuid,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"loop_type" "open_loop_type" DEFAULT 'other' NOT NULL,
	"owner" text,
	"status" "open_loop_status" DEFAULT 'open' NOT NULL,
	"priority" "open_loop_priority" DEFAULT 'medium' NOT NULL,
	"due_date" timestamp with time zone,
	"suggested_action" text,
	"suggested_follow_up_email" jsonb,
	"requires_human_approval" boolean DEFAULT false NOT NULL,
	"approved_at" timestamp with time zone,
	"outcome" text,
	"source_quote" text,
	"confidence" numeric(3, 2),
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"from_object_id" uuid NOT NULL,
	"to_object_id" uuid NOT NULL,
	"relationship_type" text NOT NULL,
	"source_item_id" uuid,
	"source_quote" text,
	"confidence" numeric(3, 2),
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_item_id" uuid NOT NULL,
	"brain_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"type" "source_type" NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"external_uri" text,
	"storage_path" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brain_id" uuid NOT NULL,
	"source_item_id" uuid,
	"workflow_type" text NOT NULL,
	"status" "workflow_status" DEFAULT 'started' NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_objects" ADD CONSTRAINT "memory_objects_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_objects" ADD CONSTRAINT "memory_objects_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_loops" ADD CONSTRAINT "open_loops_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_loops" ADD CONSTRAINT "open_loops_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_from_object_id_memory_objects_id_fk" FOREIGN KEY ("from_object_id") REFERENCES "public"."memory_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_to_object_id_memory_objects_id_fk" FOREIGN KEY ("to_object_id") REFERENCES "public"."memory_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_embeddings" ADD CONSTRAINT "source_embeddings_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_embeddings" ADD CONSTRAINT "source_embeddings_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_brain_id_idx" ON "agent_runs" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "agent_runs_source_item_id_idx" ON "agent_runs" USING btree ("source_item_id");--> statement-breakpoint
CREATE INDEX "agent_runs_workflow_id_idx" ON "agent_runs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "agent_runs_started_at_idx" ON "agent_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "memory_objects_brain_id_idx" ON "memory_objects" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "memory_objects_source_item_id_idx" ON "memory_objects" USING btree ("source_item_id");--> statement-breakpoint
CREATE INDEX "memory_objects_type_idx" ON "memory_objects" USING btree ("object_type");--> statement-breakpoint
CREATE INDEX "memory_objects_status_idx" ON "memory_objects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "open_loops_brain_id_idx" ON "open_loops" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "open_loops_source_item_id_idx" ON "open_loops" USING btree ("source_item_id");--> statement-breakpoint
CREATE INDEX "open_loops_status_idx" ON "open_loops" USING btree ("status");--> statement-breakpoint
CREATE INDEX "open_loops_priority_idx" ON "open_loops" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "relationships_brain_id_idx" ON "relationships" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "relationships_from_object_id_idx" ON "relationships" USING btree ("from_object_id");--> statement-breakpoint
CREATE INDEX "relationships_to_object_id_idx" ON "relationships" USING btree ("to_object_id");--> statement-breakpoint
CREATE INDEX "source_embeddings_source_item_id_idx" ON "source_embeddings" USING btree ("source_item_id");--> statement-breakpoint
CREATE INDEX "source_embeddings_brain_id_idx" ON "source_embeddings" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "source_embeddings_embedding_idx" ON "source_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "source_items_brain_id_idx" ON "source_items" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "workflows_brain_id_idx" ON "workflows" USING btree ("brain_id");--> statement-breakpoint
CREATE INDEX "workflows_source_item_id_idx" ON "workflows" USING btree ("source_item_id");--> statement-breakpoint
CREATE INDEX "workflows_status_idx" ON "workflows" USING btree ("status");