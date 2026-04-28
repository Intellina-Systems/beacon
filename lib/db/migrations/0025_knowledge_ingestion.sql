CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"source_type" text DEFAULT 'note' NOT NULL,
	"content" text NOT NULL,
	"summary" text,
	"embedding" vector(1536),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"document_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"evidence" text,
	"confidence" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_signals" ADD CONSTRAINT "knowledge_signals_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_signals" ADD CONSTRAINT "knowledge_signals_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_documents_product_idx" ON "knowledge_documents" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "knowledge_documents_user_product_idx" ON "knowledge_documents" USING btree ("user_id","product_id");--> statement-breakpoint
CREATE INDEX "knowledge_documents_embedding_idx" ON "knowledge_documents" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "knowledge_signals_product_idx" ON "knowledge_signals" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "knowledge_signals_document_idx" ON "knowledge_signals" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "knowledge_signals_status_idx" ON "knowledge_signals" USING btree ("status");
