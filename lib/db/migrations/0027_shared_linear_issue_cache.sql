CREATE TABLE "linear_issue_fetch_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_scope_id" text NOT NULL,
	"issues" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "linear_issue_fetch_cache_workspace_project_idx" ON "linear_issue_fetch_cache" USING btree ("workspace_id","project_scope_id");
--> statement-breakpoint
CREATE INDEX "linear_issue_fetch_cache_expires_idx" ON "linear_issue_fetch_cache" USING btree ("expires_at");
