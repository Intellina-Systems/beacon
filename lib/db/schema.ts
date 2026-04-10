import { pgTable, text, timestamp, integer, jsonb, uniqueIndex } from 'drizzle-orm/pg-core'

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

// Projects - top-level PM containers
export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  linearProjectId: text('linear_project_id'),
  linearTeamId: text('linear_team_id'),
  repoUrl: text('repo_url'),
  clientVertical: text('client_vertical'),
  trackedTopics: jsonb('tracked_topics').$type<string[]>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Project = typeof projects.$inferSelect
export type InsertProject = typeof projects.$inferInsert

// Work items - synced from Linear (or manually created)
export const workItems = pgTable('work_items', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('todo'),
  statusType: text('status_type'), // 'triage'|'backlog'|'unstarted'|'started'|'completed'|'cancelled'
  priority: integer('priority').default(0), // 0=none, 1=urgent, 2=high, 3=medium, 4=low
  assigneeLinearId: text('assignee_linear_id'),
  assigneeName: text('assignee_name'),
  linearId: text('linear_id'),
  linearUrl: text('linear_url'),
  source: text('source').default('linear'),
  dueDate: timestamp('due_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type WorkItem = typeof workItems.$inferSelect
export type InsertWorkItem = typeof workItems.$inferInsert

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
