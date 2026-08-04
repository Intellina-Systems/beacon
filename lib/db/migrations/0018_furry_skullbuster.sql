CREATE TABLE "doc_presence" (
	"id" text PRIMARY KEY NOT NULL,
	"doc_id" text NOT NULL,
	"member_id" text NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doc_presence" ADD CONSTRAINT "doc_presence_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_presence" ADD CONSTRAINT "doc_presence_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "doc_presence_doc_member_idx" ON "doc_presence" USING btree ("doc_id","member_id");--> statement-breakpoint
CREATE INDEX "doc_presence_doc_idx" ON "doc_presence" USING btree ("doc_id");