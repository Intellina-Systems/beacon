ALTER TABLE "work_item_attachments" ALTER COLUMN "data" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "work_item_attachments" ADD COLUMN "storage_path" text NOT NULL;