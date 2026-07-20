ALTER TABLE "insights" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insights_project_idx" ON "insights" USING btree ("project_id");