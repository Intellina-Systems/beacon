ALTER TABLE "docs" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "rank" text;--> statement-breakpoint
ALTER TABLE "docs" ADD CONSTRAINT "docs_parent_id_docs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "docs_parent_idx" ON "docs" USING btree ("parent_id");