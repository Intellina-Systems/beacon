CREATE TABLE IF NOT EXISTS "products" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "client_vertical" text,
  "tracked_topics" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "products_user_id_users_id_fk"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "product_linear_connections" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text NOT NULL,
  "linear_workspace_id" text NOT NULL,
  "linear_project_id" text NOT NULL,
  "linear_project_name" text,
  "linear_team_id" text,
  "linear_team_name" text,
  "sync_enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "product_linear_connections_product_id_products_id_fk"
    FOREIGN KEY ("product_id")
    REFERENCES "products"("id")
    ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_linear_project_idx"
  ON "product_linear_connections" ("product_id", "linear_project_id");

CREATE INDEX IF NOT EXISTS "product_linear_product_idx"
  ON "product_linear_connections" ("product_id");

CREATE TABLE IF NOT EXISTS "product_github_repositories" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text NOT NULL,
  "owner" text NOT NULL,
  "repo" text NOT NULL,
  "repo_url" text NOT NULL,
  "default_branch" text,
  "sync_enabled" boolean DEFAULT true NOT NULL,
  "last_synced_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "product_github_repositories_product_id_products_id_fk"
    FOREIGN KEY ("product_id")
    REFERENCES "products"("id")
    ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_github_repo_idx"
  ON "product_github_repositories" ("product_id", "owner", "repo");

CREATE INDEX IF NOT EXISTS "product_github_product_idx"
  ON "product_github_repositories" ("product_id");

CREATE TABLE IF NOT EXISTS "github_pull_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text NOT NULL,
  "repository_id" text NOT NULL,
  "github_pr_id" text NOT NULL,
  "number" integer NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "state" text NOT NULL,
  "author_login" text,
  "head_ref_name" text,
  "base_ref_name" text,
  "reviewers" jsonb,
  "labels" jsonb,
  "html_url" text NOT NULL,
  "github_created_at" timestamp,
  "github_updated_at" timestamp,
  "github_merged_at" timestamp,
  "last_synced_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "github_pull_requests_product_id_products_id_fk"
    FOREIGN KEY ("product_id")
    REFERENCES "products"("id")
    ON DELETE cascade,
  CONSTRAINT "github_pull_requests_repository_id_product_github_repositories_id_fk"
    FOREIGN KEY ("repository_id")
    REFERENCES "product_github_repositories"("id")
    ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "github_pull_requests_repo_pr_idx"
  ON "github_pull_requests" ("repository_id", "github_pr_id");

CREATE INDEX IF NOT EXISTS "github_pull_requests_product_idx"
  ON "github_pull_requests" ("product_id");

CREATE TABLE IF NOT EXISTS "github_commits" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text NOT NULL,
  "repository_id" text NOT NULL,
  "sha" text NOT NULL,
  "message" text NOT NULL,
  "author_name" text,
  "author_login" text,
  "html_url" text NOT NULL,
  "committed_at" timestamp,
  "last_synced_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "github_commits_product_id_products_id_fk"
    FOREIGN KEY ("product_id")
    REFERENCES "products"("id")
    ON DELETE cascade,
  CONSTRAINT "github_commits_repository_id_product_github_repositories_id_fk"
    FOREIGN KEY ("repository_id")
    REFERENCES "product_github_repositories"("id")
    ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "github_commits_repo_sha_idx"
  ON "github_commits" ("repository_id", "sha");

CREATE INDEX IF NOT EXISTS "github_commits_product_idx"
  ON "github_commits" ("product_id");

CREATE TABLE IF NOT EXISTS "github_linear_links" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text NOT NULL,
  "linear_issue_id" text NOT NULL,
  "github_pull_request_id" text,
  "github_commit_id" text,
  "source" text NOT NULL,
  "status" text DEFAULT 'accepted' NOT NULL,
  "rationale" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "github_linear_links_product_id_products_id_fk"
    FOREIGN KEY ("product_id")
    REFERENCES "products"("id")
    ON DELETE cascade,
  CONSTRAINT "github_linear_links_linear_issue_id_linear_issues_id_fk"
    FOREIGN KEY ("linear_issue_id")
    REFERENCES "linear_issues"("id")
    ON DELETE cascade,
  CONSTRAINT "github_linear_links_github_pull_request_id_github_pull_requests_id_fk"
    FOREIGN KEY ("github_pull_request_id")
    REFERENCES "github_pull_requests"("id")
    ON DELETE cascade,
  CONSTRAINT "github_linear_links_github_commit_id_github_commits_id_fk"
    FOREIGN KEY ("github_commit_id")
    REFERENCES "github_commits"("id")
    ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "github_linear_links_product_idx"
  ON "github_linear_links" ("product_id");

CREATE INDEX IF NOT EXISTS "github_linear_links_issue_idx"
  ON "github_linear_links" ("linear_issue_id");
