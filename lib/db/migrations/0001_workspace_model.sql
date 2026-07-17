-- Workspace model: users stay login identities; workspaces own the data.
-- Bootstrap trick: each existing owner's workspace gets id = their user id,
-- so every user_id column is renamed to workspace_id with zero data rewrite.

CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "workspaces" ("id", "name", "created_by_user_id")
SELECT u."id", COALESCE(u."name", u."username") || '''s Workspace', u."id" FROM "users" u;--> statement-breakpoint

-- Members become workspace-scoped people with an access role
ALTER TABLE "members" DROP CONSTRAINT "members_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "members" RENAME COLUMN "user_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "members" RENAME COLUMN "role" TO "title";--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "auth_user_id" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "access_role" text DEFAULT 'engineer' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "status" text DEFAULT 'profile' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_auth_user_id_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER INDEX "members_user_idx" RENAME TO "members_workspace_idx";--> statement-breakpoint

-- Link each workspace owner to an existing member profile when one matches
-- their GitHub username or email; otherwise create an owner member row.
WITH owner_match AS (
	SELECT DISTINCT ON (u."id") u."id" AS user_id, m."id" AS member_id
	FROM "users" u
	JOIN "members" m ON m."workspace_id" = u."id"
	WHERE lower(m."github_username") = lower(u."username")
		OR (m."email" IS NOT NULL AND u."email" IS NOT NULL AND lower(m."email") = lower(u."email"))
	ORDER BY u."id", m."created_at"
)
UPDATE "members" m
SET "auth_user_id" = om.user_id, "access_role" = 'admin', "status" = 'active', "updated_at" = now()
FROM owner_match om
WHERE m."id" = om.member_id;--> statement-breakpoint
INSERT INTO "members" ("id", "workspace_id", "auth_user_id", "access_role", "status", "name", "email", "avatar_url", "github_username")
SELECT 'mem_' || u."id", u."id", u."id", 'admin', 'active', COALESCE(u."name", u."username"), u."email", u."avatar_url",
	CASE WHEN u."provider" = 'github' THEN u."username" END
FROM "users" u
WHERE NOT EXISTS (
	SELECT 1 FROM "members" m WHERE m."workspace_id" = u."id" AND m."auth_user_id" = u."id"
);--> statement-breakpoint
CREATE UNIQUE INDEX "members_workspace_auth_user_idx" ON "members" USING btree ("workspace_id","auth_user_id") WHERE "members"."auth_user_id" is not null;--> statement-breakpoint

-- Teams
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'engineering' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "teams_workspace_name_idx" ON "teams" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"member_id" text NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_team_member_idx" ON "team_members" USING btree ("team_id","member_id");--> statement-breakpoint
CREATE INDEX "team_members_member_idx" ON "team_members" USING btree ("member_id");--> statement-breakpoint

-- Invites
CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"member_id" text NOT NULL,
	"email" text,
	"token_hash" text NOT NULL,
	"invited_by_member_id" text,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_member_id_members_id_fk" FOREIGN KEY ("invited_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invites_token_hash_idx" ON "invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invites_workspace_idx" ON "invites" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "invites_member_idx" ON "invites" USING btree ("member_id");--> statement-breakpoint

-- Projects, with a default "General" project per workspace
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_name_idx" ON "projects" USING btree ("workspace_id","name");--> statement-breakpoint
INSERT INTO "projects" ("id", "workspace_id", "name", "description")
SELECT 'prj_' || w."id", w."id", 'General', 'Default project' FROM "workspaces" w;--> statement-breakpoint
CREATE TABLE "project_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"team_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_teams" ADD CONSTRAINT "project_teams_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_teams" ADD CONSTRAINT "project_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_teams_project_team_idx" ON "project_teams" USING btree ("project_id","team_id");--> statement-breakpoint
CREATE INDEX "project_teams_team_idx" ON "project_teams" USING btree ("team_id");--> statement-breakpoint

-- Work items: re-key to workspace, attach to the default project
ALTER TABLE "work_items" DROP CONSTRAINT "work_items_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "work_items" RENAME COLUMN "user_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "project_id" text;--> statement-breakpoint
UPDATE "work_items" SET "project_id" = 'prj_' || "workspace_id";--> statement-breakpoint
ALTER TABLE "work_items" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER INDEX "work_items_user_idx" RENAME TO "work_items_workspace_idx";--> statement-breakpoint
ALTER INDEX "work_items_user_status_idx" RENAME TO "work_items_workspace_status_idx";--> statement-breakpoint
ALTER INDEX "work_items_user_key_idx" RENAME TO "work_items_workspace_key_idx";--> statement-breakpoint
CREATE INDEX "work_items_project_idx" ON "work_items" USING btree ("project_id");--> statement-breakpoint

-- Events
ALTER TABLE "events" DROP CONSTRAINT "events_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "user_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER INDEX "events_user_occurred_idx" RENAME TO "events_workspace_occurred_idx";--> statement-breakpoint
ALTER INDEX "events_user_type_idx" RENAME TO "events_workspace_type_idx";--> statement-breakpoint

-- Connections: the provider's own workspace columns get a provider_ prefix
-- before user_id can become our workspace_id
ALTER TABLE "connections" DROP CONSTRAINT "connections_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "connections" RENAME COLUMN "workspace_id" TO "provider_workspace_id";--> statement-breakpoint
ALTER TABLE "connections" RENAME COLUMN "workspace_name" TO "provider_workspace_name";--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "connected_by_user_id" text;--> statement-breakpoint
UPDATE "connections" SET "connected_by_user_id" = "user_id";--> statement-breakpoint
ALTER TABLE "connections" RENAME COLUMN "user_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER INDEX "connections_user_provider_idx" RENAME TO "connections_workspace_provider_idx";--> statement-breakpoint

-- Signal sources: workspace re-key + optional project mapping
ALTER TABLE "signal_sources" DROP CONSTRAINT "signal_sources_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "signal_sources" RENAME COLUMN "user_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "signal_sources" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "signal_sources" ADD CONSTRAINT "signal_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_sources" ADD CONSTRAINT "signal_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER INDEX "signal_sources_user_kind_identifier_idx" RENAME TO "signal_sources_workspace_kind_identifier_idx";--> statement-breakpoint

-- API keys
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "api_keys" RENAME COLUMN "user_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER INDEX "api_keys_user_idx" RENAME TO "api_keys_workspace_idx";--> statement-breakpoint

-- Knowledge
ALTER TABLE "knowledge_documents" DROP CONSTRAINT "knowledge_documents_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "knowledge_documents" RENAME COLUMN "user_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER INDEX "knowledge_documents_user_idx" RENAME TO "knowledge_documents_workspace_idx";--> statement-breakpoint
ALTER TABLE "knowledge_signals" DROP CONSTRAINT "knowledge_signals_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "knowledge_signals" RENAME COLUMN "user_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "knowledge_signals" ADD CONSTRAINT "knowledge_signals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER INDEX "knowledge_signals_user_idx" RENAME TO "knowledge_signals_workspace_idx";--> statement-breakpoint

-- Insights
ALTER TABLE "insights" DROP CONSTRAINT "insights_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "insights" RENAME COLUMN "user_id" TO "workspace_id";--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER INDEX "insights_user_status_idx" RENAME TO "insights_workspace_status_idx";--> statement-breakpoint
ALTER INDEX "insights_user_kind_idx" RENAME TO "insights_workspace_kind_idx";
