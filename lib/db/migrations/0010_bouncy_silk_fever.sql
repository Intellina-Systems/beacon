CREATE TABLE "calendar_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"member_id" text NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"external_email" text,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"sync_token" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp,
	"last_sync_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_event_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"master_event_id" text NOT NULL,
	"recurrence_date" timestamp with time zone NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"title" text,
	"description" text,
	"location" text,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"all_day" boolean,
	"status" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"title" text DEFAULT '(No title)' NOT NULL,
	"description" text,
	"location" text,
	"color" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"start_timezone" text DEFAULT 'UTC' NOT NULL,
	"end_timezone" text DEFAULT 'UTC' NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"rrule" text,
	"recurrence_end_at" timestamp with time zone,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"visibility" text DEFAULT 'default' NOT NULL,
	"transparency" text DEFAULT 'opaque' NOT NULL,
	"organizer_member_id" text,
	"conference_url" text,
	"external_provider" text,
	"external_id" text,
	"created_by_member_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"calendar_id" text NOT NULL,
	"shared_with_member_id" text,
	"shared_with_email" text,
	"role" text DEFAULT 'reader' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendars" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"owner_member_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#3b82f6' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"external_provider" text,
	"default_reminders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"member_id" text NOT NULL,
	"date" text NOT NULL,
	"intention" text NOT NULL,
	"work_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_attendees" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"member_id" text,
	"email" text,
	"role" text DEFAULT 'required' NOT NULL,
	"response_status" text DEFAULT 'needsAction' NOT NULL,
	"is_organizer" boolean DEFAULT false NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_id" text NOT NULL,
	"member_id" text NOT NULL,
	"method" text DEFAULT 'popup' NOT NULL,
	"minutes_before" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "calendar_accounts" ADD CONSTRAINT "calendar_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_accounts" ADD CONSTRAINT "calendar_accounts_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_overrides" ADD CONSTRAINT "calendar_event_overrides_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_overrides" ADD CONSTRAINT "calendar_event_overrides_master_event_id_calendar_events_id_fk" FOREIGN KEY ("master_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organizer_member_id_members_id_fk" FOREIGN KEY ("organizer_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_shares" ADD CONSTRAINT "calendar_shares_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_shares" ADD CONSTRAINT "calendar_shares_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_shares" ADD CONSTRAINT "calendar_shares_shared_with_member_id_members_id_fk" FOREIGN KEY ("shared_with_member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_owner_member_id_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_accounts_member_idx" ON "calendar_accounts" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "calendar_accounts_workspace_idx" ON "calendar_accounts" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_event_overrides_master_recurrence_idx" ON "calendar_event_overrides" USING btree ("master_event_id","recurrence_date");--> statement-breakpoint
CREATE INDEX "calendar_events_calendar_start_idx" ON "calendar_events" USING btree ("calendar_id","start_at");--> statement-breakpoint
CREATE INDEX "calendar_events_workspace_start_idx" ON "calendar_events" USING btree ("workspace_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_external_idx" ON "calendar_events" USING btree ("workspace_id","external_provider","external_id") WHERE "calendar_events"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_shares_calendar_member_idx" ON "calendar_shares" USING btree ("calendar_id","shared_with_member_id") WHERE "calendar_shares"."shared_with_member_id" is not null;--> statement-breakpoint
CREATE INDEX "calendar_shares_shared_member_idx" ON "calendar_shares" USING btree ("shared_with_member_id");--> statement-breakpoint
CREATE INDEX "calendars_workspace_idx" ON "calendars" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "calendars_owner_idx" ON "calendars" USING btree ("owner_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_plans_member_date_idx" ON "daily_plans" USING btree ("member_id","date");--> statement-breakpoint
CREATE INDEX "daily_plans_workspace_date_idx" ON "daily_plans" USING btree ("workspace_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "event_attendees_event_member_idx" ON "event_attendees" USING btree ("event_id","member_id") WHERE "event_attendees"."member_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "event_attendees_event_email_idx" ON "event_attendees" USING btree ("event_id","email") WHERE "event_attendees"."email" is not null;--> statement-breakpoint
CREATE INDEX "event_attendees_member_idx" ON "event_attendees" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "event_reminders_event_member_idx" ON "event_reminders" USING btree ("event_id","member_id");