CREATE TABLE "automation_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"trigger_event_type" text NOT NULL,
	"conditions" jsonb,
	"actions" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by_member_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"health" text NOT NULL,
	"body" text NOT NULL,
	"author_member_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "auto_close_days" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "auto_archive_days" integer;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_author_member_id_members_id_fk" FOREIGN KEY ("author_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_rules_workspace_idx" ON "automation_rules" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "automation_rules_trigger_idx" ON "automation_rules" USING btree ("workspace_id","trigger_event_type","enabled");--> statement-breakpoint
CREATE INDEX "project_updates_project_idx" ON "project_updates" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "project_updates_workspace_idx" ON "project_updates" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "work_items_archived_idx" ON "work_items" USING btree ("archived_at");