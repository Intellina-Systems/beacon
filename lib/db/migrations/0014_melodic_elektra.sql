CREATE TABLE "work_item_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"work_item_id" text NOT NULL,
	"comment_id" text,
	"uploaded_by_member_id" text,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_item_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"work_item_id" text NOT NULL,
	"author_member_id" text,
	"body" text NOT NULL,
	"edited_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_item_attachments" ADD CONSTRAINT "work_item_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_attachments" ADD CONSTRAINT "work_item_attachments_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_attachments" ADD CONSTRAINT "work_item_attachments_comment_id_work_item_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."work_item_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_attachments" ADD CONSTRAINT "work_item_attachments_uploaded_by_member_id_members_id_fk" FOREIGN KEY ("uploaded_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_author_member_id_members_id_fk" FOREIGN KEY ("author_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_item_attachments_item_idx" ON "work_item_attachments" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX "work_item_attachments_comment_idx" ON "work_item_attachments" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "work_item_comments_item_created_idx" ON "work_item_comments" USING btree ("work_item_id","created_at");--> statement-breakpoint
CREATE INDEX "work_item_comments_author_idx" ON "work_item_comments" USING btree ("author_member_id");