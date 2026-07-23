ALTER TABLE "docs" ADD COLUMN "public_share_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "public_share_token" text;--> statement-breakpoint
CREATE UNIQUE INDEX "docs_public_share_token_idx" ON "docs" USING btree ("public_share_token") WHERE "docs"."public_share_token" is not null;