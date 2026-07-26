ALTER TABLE "events" ADD COLUMN "repo" text;--> statement-breakpoint
CREATE INDEX "events_workspace_repo_idx" ON "events" USING btree ("workspace_id","repo");