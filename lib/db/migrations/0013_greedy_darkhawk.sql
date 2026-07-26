-- Remove the Linear integration. Historical work items (external_provider =
-- 'linear') and events (source = 'linear') are intentionally KEPT — they are
-- real data that simply stops syncing. This only drops the now-unused plumbing:
-- the per-member identity alias, the stale OAuth connection, and the watched
-- Linear signal sources.

ALTER TABLE "members" DROP COLUMN "linear_user_id";--> statement-breakpoint
DELETE FROM "connections" WHERE "provider" = 'linear';--> statement-breakpoint
DELETE FROM "signal_sources" WHERE "kind" LIKE 'linear_%';
