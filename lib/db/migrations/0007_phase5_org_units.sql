CREATE TABLE "engine_members" (
	"id" text PRIMARY KEY NOT NULL,
	"engine_id" text NOT NULL,
	"member_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engine_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"engine_id" text NOT NULL,
	"team_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engines" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_member_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "function_members" (
	"id" text PRIMARY KEY NOT NULL,
	"function_id" text NOT NULL,
	"member_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "function_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"function_id" text NOT NULL,
	"team_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "functions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_member_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "engine_id" text;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "function_id" text;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "engine_id" text;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "function_id" text;--> statement-breakpoint
ALTER TABLE "engine_members" ADD CONSTRAINT "engine_members_engine_id_engines_id_fk" FOREIGN KEY ("engine_id") REFERENCES "public"."engines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_members" ADD CONSTRAINT "engine_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_teams" ADD CONSTRAINT "engine_teams_engine_id_engines_id_fk" FOREIGN KEY ("engine_id") REFERENCES "public"."engines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_teams" ADD CONSTRAINT "engine_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engines" ADD CONSTRAINT "engines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engines" ADD CONSTRAINT "engines_owner_member_id_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_members" ADD CONSTRAINT "function_members_function_id_functions_id_fk" FOREIGN KEY ("function_id") REFERENCES "public"."functions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_members" ADD CONSTRAINT "function_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_teams" ADD CONSTRAINT "function_teams_function_id_functions_id_fk" FOREIGN KEY ("function_id") REFERENCES "public"."functions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_teams" ADD CONSTRAINT "function_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "functions" ADD CONSTRAINT "functions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "functions" ADD CONSTRAINT "functions_owner_member_id_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "engine_members_engine_member_idx" ON "engine_members" USING btree ("engine_id","member_id");--> statement-breakpoint
CREATE INDEX "engine_members_member_idx" ON "engine_members" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engine_teams_engine_team_idx" ON "engine_teams" USING btree ("engine_id","team_id");--> statement-breakpoint
CREATE INDEX "engine_teams_team_idx" ON "engine_teams" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "engines_workspace_name_idx" ON "engines" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "engines_workspace_idx" ON "engines" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "function_members_function_member_idx" ON "function_members" USING btree ("function_id","member_id");--> statement-breakpoint
CREATE INDEX "function_members_member_idx" ON "function_members" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "function_teams_function_team_idx" ON "function_teams" USING btree ("function_id","team_id");--> statement-breakpoint
CREATE INDEX "function_teams_team_idx" ON "function_teams" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "functions_workspace_name_idx" ON "functions" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "functions_workspace_idx" ON "functions" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_engine_id_engines_id_fk" FOREIGN KEY ("engine_id") REFERENCES "public"."engines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_function_id_functions_id_fk" FOREIGN KEY ("function_id") REFERENCES "public"."functions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_engine_id_engines_id_fk" FOREIGN KEY ("engine_id") REFERENCES "public"."engines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_function_id_functions_id_fk" FOREIGN KEY ("function_id") REFERENCES "public"."functions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_documents_engine_idx" ON "knowledge_documents" USING btree ("engine_id");--> statement-breakpoint
CREATE INDEX "knowledge_documents_function_idx" ON "knowledge_documents" USING btree ("function_id");--> statement-breakpoint
CREATE INDEX "work_items_engine_idx" ON "work_items" USING btree ("engine_id");--> statement-breakpoint
CREATE INDEX "work_items_function_idx" ON "work_items" USING btree ("function_id");