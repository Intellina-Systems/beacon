import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Identity & auth
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    provider: text('provider', { enum: ['github', 'vercel'] }).notNull(),
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

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['github'] })
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

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

// Engineers on the team. Signals from every source are attributed to a member
// through identity aliases (GitHub login, Linear user id, agent name, email…).
export const members = pgTable(
  'members',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email'),
    avatarUrl: text('avatar_url'),
    role: text('role'),
    githubUsername: text('github_username'),
    linearUserId: text('linear_user_id'),
    slackHandle: text('slack_handle'),
    // Free-form aliases used by coding agents / CI to identify the engineer
    aliases: jsonb('aliases').$type<string[]>(),
    skills: jsonb('skills').$type<string[]>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('members_user_idx').on(table.userId),
  }),
)

export type Member = typeof members.$inferSelect
export type InsertMember = typeof members.$inferInsert

// ---------------------------------------------------------------------------
// Work graph
// ---------------------------------------------------------------------------

export const WORK_ITEM_KINDS = ['epic', 'feature', 'task'] as const
export type WorkItemKind = (typeof WORK_ITEM_KINDS)[number]

export const WORK_ITEM_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled',
] as const
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number]

// Native work hierarchy: Epics → Features → Tasks. Status is a cached
// projection of the event stream, never the source of truth.
export const workItems = pgTable(
  'work_items',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    kind: text('kind', { enum: WORK_ITEM_KINDS }).notNull().default('task'),
    // Short human handle used to correlate signals, e.g. "BCN-42" or "AIRS-421"
    key: text('key'),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', { enum: WORK_ITEM_STATUSES }).notNull().default('todo'),
    statusChangedAt: timestamp('status_changed_at'),
    priority: integer('priority').default(0), // 0 none, 1 urgent … 4 low
    assigneeMemberId: text('assignee_member_id').references(() => members.id, { onDelete: 'set null' }),
    labels: jsonb('labels').$type<string[]>(),
    dueDate: timestamp('due_date'),
    // Provenance when mirrored from an external tracker (linear, jira, github…)
    externalProvider: text('external_provider'),
    externalId: text('external_id'),
    externalUrl: text('external_url'),
    lastEventAt: timestamp('last_event_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('work_items_user_idx').on(table.userId),
    userStatusIdx: index('work_items_user_status_idx').on(table.userId, table.status),
    parentIdx: index('work_items_parent_idx').on(table.parentId),
    userKeyIdx: uniqueIndex('work_items_user_key_idx')
      .on(table.userId, table.key)
      .where(sql`${table.key} is not null`),
    externalUnique: uniqueIndex('work_items_external_idx').on(table.userId, table.externalProvider, table.externalId),
  }),
)

export type WorkItem = typeof workItems.$inferSelect
export type InsertWorkItem = typeof workItems.$inferInsert

// ---------------------------------------------------------------------------
// Event store — the heart of Beacon. Append-only. Everything else is derived.
// ---------------------------------------------------------------------------

export const EVENT_SOURCES = [
  'github',
  'linear',
  'cicd',
  'slack',
  'calendar',
  'agent', // coding agents (Claude Code, Codex, custom plugins)
  'knowledge',
  'manual',
  'system',
] as const
export type EventSource = (typeof EVENT_SOURCES)[number]

export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: text('source', { enum: EVENT_SOURCES }).notNull(),
    // Dot-namespaced type, e.g. task.started, pr.merged, ci.failed, agent.blocked
    type: text('type').notNull(),
    // Who did it (resolved to the roster when possible, raw label always kept)
    memberId: text('member_id').references(() => members.id, { onDelete: 'set null' }),
    actorLabel: text('actor_label'),
    // What it relates to
    workItemId: text('work_item_id').references(() => workItems.id, { onDelete: 'set null' }),
    // One-line human-readable description of the event
    summary: text('summary').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    // Idempotency key from the source system (commit sha, delivery id…)
    externalId: text('external_id'),
    confidence: real('confidence'),
    occurredAt: timestamp('occurred_at').notNull(),
    ingestedAt: timestamp('ingested_at').defaultNow().notNull(),
  },
  (table) => ({
    userOccurredIdx: index('events_user_occurred_idx').on(table.userId, table.occurredAt),
    userTypeIdx: index('events_user_type_idx').on(table.userId, table.type),
    workItemIdx: index('events_work_item_idx').on(table.workItemId),
    memberIdx: index('events_member_idx').on(table.memberId),
    dedupeUnique: uniqueIndex('events_dedupe_idx').on(table.userId, table.source, table.externalId),
  }),
)

export type Event = typeof events.$inferSelect
export type InsertEvent = typeof events.$inferInsert

// ---------------------------------------------------------------------------
// Integrations — every tool is just a signal source, none of them is "the" one
// ---------------------------------------------------------------------------

export const CONNECTION_PROVIDERS = ['linear', 'slack', 'google_calendar'] as const
export type ConnectionProvider = (typeof CONNECTION_PROVIDERS)[number]

// OAuth-style connections to external providers (GitHub lives on users/accounts).
export const connections = pgTable(
  'connections',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: CONNECTION_PROVIDERS }).notNull(),
    accessToken: text('access_token').notNull(), // encrypted
    externalUserId: text('external_user_id'),
    workspaceId: text('workspace_id'),
    workspaceName: text('workspace_name'),
    config: jsonb('config').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userProviderUnique: uniqueIndex('connections_user_provider_idx').on(table.userId, table.provider),
  }),
)

export type Connection = typeof connections.$inferSelect
export type InsertConnection = typeof connections.$inferInsert

export const SIGNAL_SOURCE_KINDS = ['github_repo', 'linear_project', 'linear_team', 'linear_workspace'] as const
export type SignalSourceKind = (typeof SIGNAL_SOURCE_KINDS)[number]

// A concrete stream Beacon watches: a repo, a Linear project/team, a channel…
export const signalSources = pgTable(
  'signal_sources',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: SIGNAL_SOURCE_KINDS }).notNull(),
    // e.g. "vercel/next.js" for a repo, the Linear project/team id otherwise
    identifier: text('identifier').notNull(),
    displayName: text('display_name').notNull(),
    url: text('url'),
    config: jsonb('config').$type<Record<string, unknown>>(),
    enabled: boolean('enabled').default(true).notNull(),
    // Incremental sync position (per-connector shape)
    cursor: jsonb('cursor').$type<Record<string, unknown>>(),
    lastSyncedAt: timestamp('last_synced_at'),
    lastSyncError: text('last_sync_error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userKindIdentifierUnique: uniqueIndex('signal_sources_user_kind_identifier_idx').on(
      table.userId,
      table.kind,
      table.identifier,
    ),
  }),
)

export type SignalSource = typeof signalSources.$inferSelect
export type InsertSignalSource = typeof signalSources.$inferInsert

// API keys let coding agents, CI pipelines, and custom plugins push events.
export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    keyPrefix: text('key_prefix').notNull(), // first chars, for display
    lastUsedAt: timestamp('last_used_at'),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    keyHashUnique: uniqueIndex('api_keys_key_hash_idx').on(table.keyHash),
    userIdx: index('api_keys_user_idx').on(table.userId),
  }),
)

export type ApiKey = typeof apiKeys.$inferSelect
export type InsertApiKey = typeof apiKeys.$inferInsert

// ---------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------

export const knowledgeDocuments = pgTable(
  'knowledge_documents',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    sourceType: text('source_type', {
      enum: [
        'note',
        'email',
        'doc',
        'pdf',
        'whatsapp',
        'word',
        'excel',
        'notion',
        'google_doc',
        'google_sheet',
        'url',
        'meeting_notes',
        'other',
      ],
    })
      .notNull()
      .default('note'),
    sourceUrl: text('source_url'),
    content: text('content').notNull(),
    summary: text('summary'),
    embedding: vector('embedding', { dimensions: 1536 }),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('knowledge_documents_user_idx').on(table.userId),
  }),
)

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect
export type InsertKnowledgeDocument = typeof knowledgeDocuments.$inferInsert

export const knowledgeSignals = pgTable(
  'knowledge_signals',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
    userIdx: index('knowledge_signals_user_idx').on(table.userId),
    documentIdx: index('knowledge_signals_document_idx').on(table.documentId),
  }),
)

export type KnowledgeSignal = typeof knowledgeSignals.$inferSelect
export type InsertKnowledgeSignal = typeof knowledgeSignals.$inferInsert

// ---------------------------------------------------------------------------
// Intelligence — AI-derived findings over the event stream
// ---------------------------------------------------------------------------

export const INSIGHT_KINDS = ['blocker', 'risk', 'anomaly', 'digest', 'recommendation'] as const
export type InsightKind = (typeof INSIGHT_KINDS)[number]

export const insights = pgTable(
  'insights',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: INSIGHT_KINDS }).notNull(),
    severity: text('severity', { enum: ['info', 'warning', 'critical'] })
      .notNull()
      .default('info'),
    title: text('title').notNull(),
    detail: text('detail').notNull(),
    memberId: text('member_id').references(() => members.id, { onDelete: 'cascade' }),
    workItemId: text('work_item_id').references(() => workItems.id, { onDelete: 'cascade' }),
    sourceEventIds: jsonb('source_event_ids').$type<string[]>(),
    status: text('status', { enum: ['active', 'resolved', 'dismissed'] })
      .notNull()
      .default('active'),
    periodStart: timestamp('period_start'),
    periodEnd: timestamp('period_end'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userStatusIdx: index('insights_user_status_idx').on(table.userId, table.status),
    userKindIdx: index('insights_user_kind_idx').on(table.userId, table.kind),
  }),
)

export type Insight = typeof insights.$inferSelect
export type InsertInsight = typeof insights.$inferInsert
