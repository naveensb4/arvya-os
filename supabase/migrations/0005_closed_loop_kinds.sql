-- Extend memory_kind enum to support closed-loop core kinds.
ALTER TYPE "public"."memory_kind" ADD VALUE IF NOT EXISTS 'outcome';--> statement-breakpoint
ALTER TYPE "public"."memory_kind" ADD VALUE IF NOT EXISTS 'investor_feedback';--> statement-breakpoint
ALTER TYPE "public"."memory_kind" ADD VALUE IF NOT EXISTS 'customer_feedback';--> statement-breakpoint
ALTER TYPE "public"."memory_kind" ADD VALUE IF NOT EXISTS 'advisor_feedback';--> statement-breakpoint

-- Extend open_loop_type enum to support tighter ingestion taxonomy.
ALTER TYPE "public"."open_loop_type" ADD VALUE IF NOT EXISTS 'task';--> statement-breakpoint
ALTER TYPE "public"."open_loop_type" ADD VALUE IF NOT EXISTS 'investor_ask';--> statement-breakpoint
ALTER TYPE "public"."open_loop_type" ADD VALUE IF NOT EXISTS 'customer_ask';--> statement-breakpoint
ALTER TYPE "public"."open_loop_type" ADD VALUE IF NOT EXISTS 'strategic_question';
