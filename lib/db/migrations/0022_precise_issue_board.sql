CREATE TABLE IF NOT EXISTS "linear_issues" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "linear_issue_id" text NOT NULL,
  "identifier" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "status" text NOT NULL,
  "status_type" text,
  "priority" integer DEFAULT 0,
  "assignee_linear_id" text,
  "assignee_name" text,
  "linear_project_id" text,
  "project_name" text,
  "linear_team_id" text,
  "team_name" text,
  "linear_url" text,
  "due_date" timestamp,
  "linear_created_at" timestamp,
  "linear_updated_at" timestamp,
  "last_synced_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "linear_issues_user_id_users_id_fk"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "linear_issues_user_issue_idx"
  ON "linear_issues" ("user_id", "linear_issue_id");

CREATE INDEX IF NOT EXISTS "linear_issues_user_status_idx"
  ON "linear_issues" ("user_id", "status_type");

CREATE INDEX IF NOT EXISTS "linear_issues_user_project_idx"
  ON "linear_issues" ("user_id", "linear_project_id");
