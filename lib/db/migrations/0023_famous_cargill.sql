ALTER TABLE "events" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "instrumentation" text;--> statement-breakpoint
CREATE INDEX "events_session_idx" ON "events" USING btree ("session_id");