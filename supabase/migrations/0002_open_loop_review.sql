ALTER TYPE "public"."open_loop_status" ADD VALUE IF NOT EXISTS 'needs_review' BEFORE 'open';--> statement-breakpoint
ALTER TYPE "public"."open_loop_status" ADD VALUE IF NOT EXISTS 'dismissed' BEFORE 'closed';--> statement-breakpoint
ALTER TABLE "open_loops" ALTER COLUMN "status" SET DEFAULT 'needs_review';--> statement-breakpoint
