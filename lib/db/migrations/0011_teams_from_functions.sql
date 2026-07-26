-- Merge org "Functions" into the real Teams table. `functions` held the real
-- data (org units) while `teams` was empty; copy preserves ids so nothing that
-- referenced a function id breaks, and each function's owner becomes a lead.

INSERT INTO "teams" ("id", "workspace_id", "name", "description", "kind", "created_at", "updated_at")
SELECT "id", "workspace_id", "name", "description", 'engineering', "created_at", "updated_at"
FROM "functions"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "team_members" ("id", "team_id", "member_id", "is_lead", "created_at")
SELECT "id", "function_id", "member_id", false, "created_at"
FROM "function_members"
ON CONFLICT ("team_id", "member_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "team_members" ("id", "team_id", "member_id", "is_lead", "created_at")
SELECT substr(md5(random()::text || clock_timestamp()::text), 1, 16), "id", "owner_member_id", true, now()
FROM "functions"
WHERE "owner_member_id" IS NOT NULL
ON CONFLICT ("team_id", "member_id") DO UPDATE SET "is_lead" = true;
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "team_id" text;--> statement-breakpoint
UPDATE "work_items" SET "team_id" = "function_id";--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_items_team_idx" ON "work_items" USING btree ("team_id");--> statement-breakpoint
ALTER TABLE "work_items" DROP CONSTRAINT "work_items_function_id_functions_id_fk";--> statement-breakpoint
DROP INDEX "work_items_function_idx";--> statement-breakpoint
ALTER TABLE "work_items" DROP COLUMN "function_id";--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "team_id" text;--> statement-breakpoint
UPDATE "knowledge_documents" SET "team_id" = "function_id";--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_documents_team_idx" ON "knowledge_documents" USING btree ("team_id");--> statement-breakpoint
ALTER TABLE "knowledge_documents" DROP CONSTRAINT "knowledge_documents_function_id_functions_id_fk";--> statement-breakpoint
DROP INDEX "knowledge_documents_function_idx";--> statement-breakpoint
ALTER TABLE "knowledge_documents" DROP COLUMN "function_id";--> statement-breakpoint
DROP TABLE "function_teams" CASCADE;--> statement-breakpoint
DROP TABLE "engine_teams" CASCADE;--> statement-breakpoint
DROP TABLE "function_members" CASCADE;--> statement-breakpoint
DROP TABLE "functions" CASCADE;
