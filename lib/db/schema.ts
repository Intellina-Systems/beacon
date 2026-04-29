import { boolean, pgTable, text, timestamp, integer, jsonb, uniqueIndex, index, vector } from 'drizzle-orm/pg-core'

// Users table - user profile and primary OAuth account
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    provider: text('provider', {
      enum: ['github', 'vercel'],
    }).notNull(),
    externalId: text('external_id').notNull(),
    accessToken: text('access_token').notNull(), // encrypted
    refreshToken: text('refresh_token'), // encrypted
    scope: text('scope'),
    username: text('username').notNull(),
    email: text('email'),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    lastLoginAt: timestamp('last_login_at').defaultNow().notNull(),
  },
  (table) => ({
    providerExternalIdUnique: uniqueIndex('users_provider_external_id_idx').on(table.provider, table.externalId),
  }),
)

export type User = typeof users.$inferSelect
export type InsertUser = typeof users.$inferInsert

// Accounts table - additional OAuth accounts linked to a user (e.g. Vercel user connecting GitHub)
export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', {
      enum: ['github'],
    })
      .notNull()
      .default('github'),
    externalUserId: text('external_user_id').notNull(),
    accessToken: text('access_token').notNull(), // encrypted
    refreshToken: text('refresh_token'), // encrypted
    expiresAt: timestamp('expires_at'),
    scope: text('scope'),
    username: text('username').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdProviderUnique: uniqueIndex('accounts_user_id_provider_idx').on(table.userId, table.provider),
  }),
)

export type Account = typeof accounts.$inferSelect
export type InsertAccount = typeof accounts.$inferInsert

// Keep legacy export for backwards compatibility
export const userConnections = accounts
export type UserConnection = Account
export type InsertUserConnection = InsertAccount

// Settings table - per-user key-value config overrides
export const settings = pgTable(
  'settings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdKeyUnique: uniqueIndex('settings_user_id_key_idx').on(table.userId, table.key),
  }),
)

export type Setting = typeof settings.$inferSelect
export type InsertSetting = typeof settings.$inferInsert

// Linear connections - stores per-user Linear OAuth tokens
export const linearConnections = pgTable(
  'linear_connections',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token').notNull(), // encrypted
    workspaceId: text('workspace_id').notNull(),
    workspaceName: text('workspace_name'),
    workspaceSlug: text('workspace_slug'),
    linearUserId: text('linear_user_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdUnique: uniqueIndex('linear_connections_user_id_idx').on(table.userId),
  }),
)

export type LinearConnection = typeof linearConnections.$inferSelect
export type InsertLinearConnection = typeof linearConnections.$inferInsert

// Linear issues - workspace-wide issue cache grouped for board views
export const linearIssues = pgTable(
  'linear_issues',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    linearIssueId: text('linear_issue_id').notNull(),
    identifier: text('identifier').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull(),
    statusType: text('status_type'),
    priority: integer('priority').default(0),
    assigneeLinearId: text('assignee_linear_id'),
    assigneeName: text('assignee_name'),
    linearProjectId: text('linear_project_id'),
    projectName: text('project_name'),
    linearTeamId: text('linear_team_id'),
    teamName: text('team_name'),
    linearUrl: text('linear_url'),
    dueDate: timestamp('due_date'),
    linearCreatedAt: timestamp('linear_created_at'),
    linearUpdatedAt: timestamp('linear_updated_at'),
    lastSyncedAt: timestamp('last_synced_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIssueUnique: uniqueIndex('linear_issues_user_issue_idx').on(table.userId, table.linearIssueId),
    userStatusIdx: index('linear_issues_user_status_idx').on(table.userId, table.statusType),
    userProjectIdx: index('linear_issues_user_project_idx').on(table.userId, table.linearProjectId),
  }),
)

export type LinearIssue = typeof linearIssues.$inferSelect
export type InsertLinearIssue = typeof linearIssues.$inferInsert

// Products - top-level Beacon container for the product a user is building
export const products = pgTable('products', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  clientVertical: text('client_vertical'),
  trackedTopics: jsonb('tracked_topics').$type<string[]>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Product = typeof products.$inferSelect
export type InsertProduct = typeof products.$inferInsert

// Product Linear connections - maps one Beacon product to one Linear workspace
export const productLinearConnections = pgTable(
  'product_linear_connections',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    linearWorkspaceId: text('linear_workspace_id').notNull(),
    linearProjectId: text('linear_project_id'),
    linearProjectName: text('linear_project_name'),
    linearTeamId: text('linear_team_id'),
    linearTeamName: text('linear_team_name'),
    syncEnabled: boolean('sync_enabled').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    productUnique: uniqueIndex('product_linear_connection_product_idx').on(table.productId),
    productLinearProjectUnique: uniqueIndex('product_linear_project_idx').on(table.productId, table.linearProjectId),
  }),
)

export type ProductLinearConnection = typeof productLinearConnections.$inferSelect
export type InsertProductLinearConnection = typeof productLinearConnections.$inferInsert

// Product GitHub repositories - maps one Beacon product to one or more GitHub repos
export const productGitHubRepositories = pgTable(
  'product_github_repositories',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    repoUrl: text('repo_url').notNull(),
    defaultBranch: text('default_branch'),
    syncEnabled: boolean('sync_enabled').default(true).notNull(),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    productRepoUnique: uniqueIndex('product_github_repo_idx').on(table.productId, table.owner, table.repo),
    productIdx: index('product_github_product_idx').on(table.productId),
  }),
)

export type ProductGitHubRepository = typeof productGitHubRepositories.$inferSelect
export type InsertProductGitHubRepository = typeof productGitHubRepositories.$inferInsert

export const githubPullRequests = pgTable(
  'github_pull_requests',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => productGitHubRepositories.id, { onDelete: 'cascade' }),
    githubPrId: text('github_pr_id').notNull(),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    state: text('state').notNull(),
    authorLogin: text('author_login'),
    headRefName: text('head_ref_name'),
    baseRefName: text('base_ref_name'),
    reviewers: jsonb('reviewers').$type<string[]>(),
    labels: jsonb('labels').$type<string[]>(),
    htmlUrl: text('html_url').notNull(),
    githubCreatedAt: timestamp('github_created_at'),
    githubUpdatedAt: timestamp('github_updated_at'),
    githubMergedAt: timestamp('github_merged_at'),
    lastSyncedAt: timestamp('last_synced_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    repoPrUnique: uniqueIndex('github_pull_requests_repo_pr_idx').on(table.repositoryId, table.githubPrId),
    productIdx: index('github_pull_requests_product_idx').on(table.productId),
  }),
)

export type GitHubPullRequest = typeof githubPullRequests.$inferSelect
export type InsertGitHubPullRequest = typeof githubPullRequests.$inferInsert

export const githubCommits = pgTable(
  'github_commits',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => productGitHubRepositories.id, { onDelete: 'cascade' }),
    sha: text('sha').notNull(),
    message: text('message').notNull(),
    authorName: text('author_name'),
    authorLogin: text('author_login'),
    htmlUrl: text('html_url').notNull(),
    committedAt: timestamp('committed_at'),
    lastSyncedAt: timestamp('last_synced_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    repoShaUnique: uniqueIndex('github_commits_repo_sha_idx').on(table.repositoryId, table.sha),
    productIdx: index('github_commits_product_idx').on(table.productId),
  }),
)

export type GitHubCommit = typeof githubCommits.$inferSelect
export type InsertGitHubCommit = typeof githubCommits.$inferInsert

export const githubLinearLinks = pgTable(
  'github_linear_links',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    linearIssueId: text('linear_issue_id')
      .notNull()
      .references(() => linearIssues.id, { onDelete: 'cascade' }),
    githubPullRequestId: text('github_pull_request_id').references(() => githubPullRequests.id, {
      onDelete: 'cascade',
    }),
    githubCommitId: text('github_commit_id').references(() => githubCommits.id, { onDelete: 'cascade' }),
    source: text('source', { enum: ['identifier_match', 'ai_suggestion', 'manual'] }).notNull(),
    status: text('status', { enum: ['accepted', 'suggested', 'rejected'] })
      .notNull()
      .default('accepted'),
    rationale: text('rationale'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    productIdx: index('github_linear_links_product_idx').on(table.productId),
    issueIdx: index('github_linear_links_issue_idx').on(table.linearIssueId),
  }),
)

export type GitHubLinearLink = typeof githubLinearLinks.$inferSelect
export type InsertGitHubLinearLink = typeof githubLinearLinks.$inferInsert

export const knowledgeDocuments = pgTable(
  'knowledge_documents',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    sourceType: text('source_type', { enum: ['note', 'email', 'doc', 'pdf', 'whatsapp', 'other'] })
      .notNull()
      .default('note'),
    content: text('content').notNull(),
    summary: text('summary'),
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    productIdx: index('knowledge_documents_product_idx').on(table.productId),
    userProductIdx: index('knowledge_documents_user_product_idx').on(table.userId, table.productId),
  }),
)

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect
export type InsertKnowledgeDocument = typeof knowledgeDocuments.$inferInsert

export const knowledgeSignals = pgTable(
  'knowledge_signals',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: ['user_need', 'pain_point', 'feature_request', 'blocker', 'risk', 'decision', 'question'],
    }).notNull(),
    title: text('title').notNull(),
    detail: text('detail').notNull(),
    evidence: text('evidence'),
    confidence: integer('confidence').default(3).notNull(),
    status: text('status', { enum: ['new', 'reviewed', 'dismissed'] })
      .notNull()
      .default('new'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    productIdx: index('knowledge_signals_product_idx').on(table.productId),
    documentIdx: index('knowledge_signals_document_idx').on(table.documentId),
    statusIdx: index('knowledge_signals_status_idx').on(table.status),
  }),
)

export type KnowledgeSignal = typeof knowledgeSignals.$inferSelect
export type InsertKnowledgeSignal = typeof knowledgeSignals.$inferInsert

// Members - team roster
export const members = pgTable('members', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  avatarUrl: text('avatar_url'),
  githubUsername: text('github_username'),
  linearUserId: text('linear_user_id'),
  role: text('role'),
  inferredSkills: jsonb('inferred_skills').$type<string[]>(),
  currentWorkload: integer('current_workload').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Member = typeof members.$inferSelect
export type InsertMember = typeof members.$inferInsert
