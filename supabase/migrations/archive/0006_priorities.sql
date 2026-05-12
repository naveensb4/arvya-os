DO $$ BEGIN
    CREATE TYPE "public"."priority_set_by" AS ENUM('naveen', 'pb', 'system');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."priority_horizon" AS ENUM('today', 'week', 'sprint', 'quarter');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."priority_status" AS ENUM('active', 'achieved', 'abandoned');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "priorities" (
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
DO $$ BEGIN
    ALTER TABLE "priorities" ADD CONSTRAINT "priorities_brain_id_brains_id_fk" FOREIGN KEY ("brain_id") REFERENCES "public"."brains"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "priorities_brain_id_idx" ON "priorities" USING btree ("brain_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "priorities_brain_status_idx" ON "priorities" USING btree ("brain_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "priorities_status_idx" ON "priorities" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "priorities_set_at_idx" ON "priorities" USING btree ("set_at");
