-- Closed-loop core: tables that back the outcome detector and the entity
-- resolver. canonical_entities and memory_objects.embedding already exist
-- from earlier migrations. The nudges table also already exists. So this
-- migration just adds:
--   1. canonical_entities.embedding vector(1536) + HNSW index, so the
--      entity resolver can do top-N cosine retrieval on existing entities
--      before deciding to merge or create.
--   2. loop_outcome_log table — every closed-loop matcher decision.

-- (1) canonical_entities embedding for vector dedup
ALTER TABLE "canonical_entities"
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "canonical_entities_embedding_idx"
  ON "canonical_entities"
  USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint

-- (2) loop_outcome_log: audit trail for the closed-loop matcher.

-- Decision log for the closed-loop matcher. Every match attempt writes a row
-- so we have an audit trail and future training data ("what did the brain
-- close vs. what did the human override?").
DO $$ BEGIN
    CREATE TYPE "public"."loop_outcome_decision" AS ENUM(
      'closed',
      'advanced',
      'contradicts',
      'no_match',
      'uncertain'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "loop_outcome_log" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "brain_id" uuid NOT NULL,
    "loop_id" uuid NOT NULL,
    "source_item_id" uuid,
    "decision" "loop_outcome_decision" NOT NULL,
    "confidence" numeric(3, 2),
    "evidence_quote" text,
    "agent_run_id" uuid,
    "decided_at" timestamp with time zone DEFAULT now() NOT NULL,
    "human_overrode" boolean DEFAULT false NOT NULL,
    "human_override_at" timestamp with time zone,
    "properties" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint

ALTER TABLE "loop_outcome_log"
  ADD CONSTRAINT "loop_outcome_log_brain_id_brains_id_fk"
  FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade;
--> statement-breakpoint

ALTER TABLE "loop_outcome_log"
  ADD CONSTRAINT "loop_outcome_log_loop_id_open_loops_id_fk"
  FOREIGN KEY ("loop_id") REFERENCES "public"."open_loops"("id") ON DELETE cascade;
--> statement-breakpoint

ALTER TABLE "loop_outcome_log"
  ADD CONSTRAINT "loop_outcome_log_source_item_id_source_items_id_fk"
  FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE set null;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "loop_outcome_log_brain_decided_at_idx"
  ON "loop_outcome_log" ("brain_id", "decided_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loop_outcome_log_loop_id_idx"
  ON "loop_outcome_log" ("loop_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loop_outcome_log_source_item_id_idx"
  ON "loop_outcome_log" ("source_item_id");
--> statement-breakpoint

-- Nudges reuse the existing public.nudges table (nudge_type, related_open_loop_id,
-- delivery_channels, acknowledged_at, dismissed_at). No new table needed.
-- nudge_type values used by the deadline nudger:
--   'pre_deadline' | 'stale' | 'outcome_uncertain' | 'digest'
