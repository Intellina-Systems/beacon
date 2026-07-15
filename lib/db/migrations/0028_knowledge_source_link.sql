ALTER TABLE "knowledge_documents" ADD COLUMN "source_url" text;
--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "last_synced_at" timestamp;
