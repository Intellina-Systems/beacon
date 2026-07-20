CREATE TABLE "doc_collaborators" (
	"id" text PRIMARY KEY NOT NULL,
	"doc_id" text NOT NULL,
	"member_id" text NOT NULL,
	"permission" text DEFAULT 'view' NOT NULL,
	"added_by_member_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "docs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"owner_member_id" text NOT NULL,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"content" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"share_mode" text DEFAULT 'private' NOT NULL,
	"workspace_permission" text DEFAULT 'view' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doc_collaborators" ADD CONSTRAINT "doc_collaborators_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_collaborators" ADD CONSTRAINT "doc_collaborators_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_collaborators" ADD CONSTRAINT "doc_collaborators_added_by_member_id_members_id_fk" FOREIGN KEY ("added_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docs" ADD CONSTRAINT "docs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docs" ADD CONSTRAINT "docs_owner_member_id_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "doc_collaborators_doc_member_idx" ON "doc_collaborators" USING btree ("doc_id","member_id");--> statement-breakpoint
CREATE INDEX "doc_collaborators_member_idx" ON "doc_collaborators" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "docs_workspace_idx" ON "docs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "docs_owner_idx" ON "docs" USING btree ("owner_member_id");