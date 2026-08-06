-- chat_conversations, its FKs, and its two indexes already existed live
-- (pre-dating this repo's own migration tracking of the table — see
-- lib/db/schema.ts's comment on chatConversations). scope is the only
-- actual new column this migration adds.
ALTER TABLE "chat_conversations" ADD COLUMN "scope" jsonb;
