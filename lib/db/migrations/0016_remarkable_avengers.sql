ALTER TABLE "daily_plans" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_plans" ADD COLUMN "completed_at" timestamp;