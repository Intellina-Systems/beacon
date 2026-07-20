CREATE TABLE "cycle_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"cycle_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"snapshot_date" text NOT NULL,
	"scope_points" real NOT NULL,
	"started_points" real NOT NULL,
	"completed_points" real NOT NULL,
	"item_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cycles" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"number" integer NOT NULL,
	"name" text,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"cooldown_ends_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "views" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"layout" text DEFAULT 'list' NOT NULL,
	"filters" jsonb,
	"created_by_member_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "cycle_id" text;--> statement-breakpoint
ALTER TABLE "cycle_snapshots" ADD CONSTRAINT "cycle_snapshots_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle_snapshots" ADD CONSTRAINT "cycle_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "views" ADD CONSTRAINT "views_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "views" ADD CONSTRAINT "views_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_snapshots_cycle_date_idx" ON "cycle_snapshots" USING btree ("cycle_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "cycle_snapshots_cycle_idx" ON "cycle_snapshots" USING btree ("cycle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cycles_project_number_idx" ON "cycles" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "cycles_project_idx" ON "cycles" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "cycles_workspace_idx" ON "cycles" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "views_workspace_name_idx" ON "views" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "views_workspace_idx" ON "views" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "work_items_cycle_idx" ON "work_items" USING btree ("cycle_id");