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
// Workspace — the org-level container every signal, work item, and member
// belongs to. Users are login identities; workspaces own the data.
// ---------------------------------------------------------------------------

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  // Native issue keys: one shared counter per workspace → "BEA-1", "BEA-2", …
  // Allocation increments issueCounter atomically; the incremented value is the number.
  issuePrefix: text('issue_prefix').notNull().default('BEA'),
  issueCounter: integer('issue_counter').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Workspace = typeof workspaces.$inferSelect
export type InsertWorkspace = typeof workspaces.$inferInsert

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

export const ACCESS_ROLES = ['admin', 'manager', 'engineer'] as const
export type AccessRole = (typeof ACCESS_ROLES)[number]

export const MEMBER_STATUSES = ['profile', 'invited', 'active'] as const
export type MemberStatus = (typeof MEMBER_STATUSES)[number]

// People in the workspace. Signals from every source are attributed to a member
// through identity aliases (GitHub login, Linear user id, agent name, email…).
// A member may be a pure attribution profile (no login), an invitee, or an
// active user (authUserId set). accessRole controls what they see when they
// log in; title is just the human job title.
export const members = pgTable(
  'members',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    authUserId: text('auth_user_id').references(() => users.id, { onDelete: 'set null' }),
    accessRole: text('access_role', { enum: ACCESS_ROLES }).notNull().default('engineer'),
    status: text('status', { enum: MEMBER_STATUSES }).notNull().default('profile'),
    name: text('name').notNull(),
    email: text('email'),
    avatarUrl: text('avatar_url'),
    title: text('title'),
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
    workspaceIdx: index('members_workspace_idx').on(table.workspaceId),
    workspaceAuthUserUnique: uniqueIndex('members_workspace_auth_user_idx')
      .on(table.workspaceId, table.authUserId)
      .where(sql`${table.authUserId} is not null`),
  }),
)

export type Member = typeof members.$inferSelect
export type InsertMember = typeof members.$inferInsert

export const TEAM_KINDS = ['engineering', 'non_technical'] as const
export type TeamKind = (typeof TEAM_KINDS)[number]

// Teams group members inside a workspace. Orthogonal to projects: a team can
// work across projects, and members can belong to several teams.
export const teams = pgTable(
  'teams',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    kind: text('kind', { enum: TEAM_KINDS }).notNull().default('engineering'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceNameUnique: uniqueIndex('teams_workspace_name_idx').on(table.workspaceId, table.name),
  }),
)

export type Team = typeof teams.$inferSelect
export type InsertTeam = typeof teams.$inferInsert

// Membership is many-to-many; isLead gives an engineer manager-like visibility
// scoped to that team only (leads may report straight to the admin — no
// workspace-level manager required anywhere).
export const teamMembers = pgTable(
  'team_members',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    isLead: boolean('is_lead').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    teamMemberUnique: uniqueIndex('team_members_team_member_idx').on(table.teamId, table.memberId),
    memberIdx: index('team_members_member_idx').on(table.memberId),
  }),
)

export type TeamMember = typeof teamMembers.$inferSelect
export type InsertTeamMember = typeof teamMembers.$inferInsert

// ---------------------------------------------------------------------------
// Org units — Engines (technical/product subsystems, e.g. "Assessment
// Engine") and Functions (cross-cutting practice areas, e.g. "QA"). Both are
// independent of the Project hierarchy: a work item or knowledge doc can be
// tagged with an Engine and/or a Function as its own dimension, not nested
// under either. Each unit has exactly one Owner, a roster of Members
// (separate from the owner), and links to one or more Teams — mirrors how
// the company's real org chart is structured, distinct from Beacon's
// existing Team/Project grouping.
// ---------------------------------------------------------------------------

export const engines = pgTable(
  'engines',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    ownerMemberId: text('owner_member_id').references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceNameUnique: uniqueIndex('engines_workspace_name_idx').on(table.workspaceId, table.name),
    workspaceIdx: index('engines_workspace_idx').on(table.workspaceId),
  }),
)

export type Engine = typeof engines.$inferSelect
export type InsertEngine = typeof engines.$inferInsert

export const engineMembers = pgTable(
  'engine_members',
  {
    id: text('id').primaryKey(),
    engineId: text('engine_id')
      .notNull()
      .references(() => engines.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    engineMemberUnique: uniqueIndex('engine_members_engine_member_idx').on(table.engineId, table.memberId),
    memberIdx: index('engine_members_member_idx').on(table.memberId),
  }),
)

export type EngineMember = typeof engineMembers.$inferSelect
export type InsertEngineMember = typeof engineMembers.$inferInsert

export const engineTeams = pgTable(
  'engine_teams',
  {
    id: text('id').primaryKey(),
    engineId: text('engine_id')
      .notNull()
      .references(() => engines.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    engineTeamUnique: uniqueIndex('engine_teams_engine_team_idx').on(table.engineId, table.teamId),
    teamIdx: index('engine_teams_team_idx').on(table.teamId),
  }),
)

export type EngineTeam = typeof engineTeams.$inferSelect
export type InsertEngineTeam = typeof engineTeams.$inferInsert

// "OrgFunction" (not "Function") to avoid colliding with the built-in TS type.
export const functions = pgTable(
  'functions',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    ownerMemberId: text('owner_member_id').references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceNameUnique: uniqueIndex('functions_workspace_name_idx').on(table.workspaceId, table.name),
    workspaceIdx: index('functions_workspace_idx').on(table.workspaceId),
  }),
)

export type OrgFunction = typeof functions.$inferSelect
export type InsertOrgFunction = typeof functions.$inferInsert

export const functionMembers = pgTable(
  'function_members',
  {
    id: text('id').primaryKey(),
    functionId: text('function_id')
      .notNull()
      .references(() => functions.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    functionMemberUnique: uniqueIndex('function_members_function_member_idx').on(table.functionId, table.memberId),
    memberIdx: index('function_members_member_idx').on(table.memberId),
  }),
)

export type FunctionMember = typeof functionMembers.$inferSelect
export type InsertFunctionMember = typeof functionMembers.$inferInsert

export const functionTeams = pgTable(
  'function_teams',
  {
    id: text('id').primaryKey(),
    functionId: text('function_id')
      .notNull()
      .references(() => functions.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    functionTeamUnique: uniqueIndex('function_teams_function_team_idx').on(table.functionId, table.teamId),
    teamIdx: index('function_teams_team_idx').on(table.teamId),
  }),
)

export type FunctionTeam = typeof functionTeams.$inferSelect
export type InsertFunctionTeam = typeof functionTeams.$inferInsert

// Link-based invites. The member row (with role + team assignments) is created
// up front by an admin; claiming the token binds the signing-in user to it.
export const invites = pgTable(
  'invites',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    email: text('email'),
    tokenHash: text('token_hash').notNull(),
    invitedByMemberId: text('invited_by_member_id').references(() => members.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at').notNull(),
    acceptedAt: timestamp('accepted_at'),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex('invites_token_hash_idx').on(table.tokenHash),
    workspaceIdx: index('invites_workspace_idx').on(table.workspaceId),
    memberIdx: index('invites_member_idx').on(table.memberId),
  }),
)

export type Invite = typeof invites.$inferSelect
export type InsertInvite = typeof invites.$inferInsert

// ---------------------------------------------------------------------------
// Projects — initiatives inside a workspace. Hierarchy:
// Workspace → Projects → Epics → Features → Tasks.
// ---------------------------------------------------------------------------

export const PROJECT_STATUSES = ['active', 'paused', 'archived'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status', { enum: PROJECT_STATUSES }).notNull().default('active'),
    // Hygiene thresholds (days of inactivity). Null disables that job for this
    // project — auto-close/archive is opt-in, not a workspace-wide default.
    autoCloseDays: integer('auto_close_days'),
    autoArchiveDays: integer('auto_archive_days'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceNameUnique: uniqueIndex('projects_workspace_name_idx').on(table.workspaceId, table.name),
  }),
)

export type Project = typeof projects.$inferSelect
export type InsertProject = typeof projects.$inferInsert

// Which teams are assigned to a project — capacity/planning signal, not an
// access wall (visibility stays member/team-based).
export const projectTeams = pgTable(
  'project_teams',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    projectTeamUnique: uniqueIndex('project_teams_project_team_idx').on(table.projectId, table.teamId),
    teamIdx: index('project_teams_team_idx').on(table.teamId),
  }),
)

export type ProjectTeam = typeof projectTeams.$inferSelect
export type InsertProjectTeam = typeof projectTeams.$inferInsert

// ---------------------------------------------------------------------------
// Work graph
// ---------------------------------------------------------------------------

export const WORK_ITEM_KINDS = ['epic', 'feature', 'task'] as const
export type WorkItemKind = (typeof WORK_ITEM_KINDS)[number]

export const WORK_ITEM_STATUSES = [
  'triage',
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
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // Independent org-chart tags, orthogonal to projectId — see "Org units" above.
    engineId: text('engine_id').references(() => engines.id, { onDelete: 'set null' }),
    functionId: text('function_id').references(() => functions.id, { onDelete: 'set null' }),
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
    // Canonical manual ordering: base-62 fractional-index string (lib/work-items/rank.ts).
    // Null sorts after ranked items; a rank is assigned on create and on any drag.
    rank: text('rank'),
    // Effort in points; null = unestimated (counts as 1 point in progress math)
    estimate: real('estimate'),
    // Triage snooze: hidden from the triage queue until this time passes
    snoozedUntil: timestamp('snoozed_until'),
    // Which cycle (sprint) this item is planned in, if any. Auto-set when an
    // item reaches a started/completed status while its project has an
    // active cycle; auto-carried to the next cycle on rollover.
    cycleId: text('cycle_id'),
    // Hygiene: set by the auto-archive job when a resolved item has been
    // inactive past its project's threshold. Hidden from default list views;
    // never deleted, never affects status.
    archivedAt: timestamp('archived_at'),
    // Provenance when mirrored from an external tracker (linear, jira, github…)
    externalProvider: text('external_provider'),
    externalId: text('external_id'),
    externalUrl: text('external_url'),
    lastEventAt: timestamp('last_event_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index('work_items_workspace_idx').on(table.workspaceId),
    workspaceStatusIdx: index('work_items_workspace_status_idx').on(table.workspaceId, table.status),
    projectIdx: index('work_items_project_idx').on(table.projectId),
    engineIdx: index('work_items_engine_idx').on(table.engineId),
    functionIdx: index('work_items_function_idx').on(table.functionId),
    parentIdx: index('work_items_parent_idx').on(table.parentId),
    cycleIdx: index('work_items_cycle_idx').on(table.cycleId),
    archivedIdx: index('work_items_archived_idx').on(table.archivedAt),
    workspaceKeyIdx: uniqueIndex('work_items_workspace_key_idx')
      .on(table.workspaceId, table.key)
      .where(sql`${table.key} is not null`),
    externalUnique: uniqueIndex('work_items_external_idx').on(
      table.workspaceId,
      table.externalProvider,
      table.externalId,
    ),
  }),
)

export type WorkItem = typeof workItems.$inferSelect
export type InsertWorkItem = typeof workItems.$inferInsert

// ---------------------------------------------------------------------------
// Cycles — project-scoped time-boxes (Beacon has no team-scoped work routing,
// so cycles hang off the project, the container every work item already
// requires). Auto-repeating: a cron rolls unfinished, non-terminal items into
// an auto-created next cycle when the current one's endsAt passes.
// ---------------------------------------------------------------------------

export const cycles = pgTable(
  'cycles',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(), // sequential per project, starting at 1
    name: text('name'), // optional custom name; UI falls back to "Cycle {number}"
    startsAt: timestamp('starts_at').notNull(),
    endsAt: timestamp('ends_at').notNull(),
    cooldownEndsAt: timestamp('cooldown_ends_at'), // optional gap before the next cycle starts
    // Set by the rollover job (or an early manual close). Null = still
    // upcoming or active. Once set, the cycle and its snapshots are frozen —
    // history is never rewritten.
    closedAt: timestamp('closed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    projectNumberUnique: uniqueIndex('cycles_project_number_idx').on(table.projectId, table.number),
    projectIdx: index('cycles_project_idx').on(table.projectId),
    workspaceIdx: index('cycles_workspace_idx').on(table.workspaceId),
  }),
)

export type Cycle = typeof cycles.$inferSelect
export type InsertCycle = typeof cycles.$inferInsert

// Daily point-in-time rollup per cycle for burnup/velocity charts. Unestimated
// items count as 1 point (same convention Linear uses) so charts work without
// mandatory estimation. One row per (cycle, day); the cron upserts today's row.
export const cycleSnapshots = pgTable(
  'cycle_snapshots',
  {
    id: text('id').primaryKey(),
    cycleId: text('cycle_id')
      .notNull()
      .references(() => cycles.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    snapshotDate: text('snapshot_date').notNull(), // 'YYYY-MM-DD', cycle-local computation day
    scopePoints: real('scope_points').notNull(), // sum of estimates of every item ever in the cycle
    startedPoints: real('started_points').notNull(), // scope currently in_progress/in_review/blocked/done
    completedPoints: real('completed_points').notNull(), // scope currently done
    itemCount: integer('item_count').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    cycleDateUnique: uniqueIndex('cycle_snapshots_cycle_date_idx').on(table.cycleId, table.snapshotDate),
    cycleIdx: index('cycle_snapshots_cycle_idx').on(table.cycleId),
  }),
)

export type CycleSnapshot = typeof cycleSnapshots.$inferSelect
export type InsertCycleSnapshot = typeof cycleSnapshots.$inferInsert

// ---------------------------------------------------------------------------
// Saved views — a named filter + layout over work_items. Boards are just a
// view with layout 'board'; nothing about a view mutates data, matching
// every tracker studied (Jira boards, GitHub Projects views, Height lists).
// ---------------------------------------------------------------------------

export const VIEW_LAYOUTS = ['list', 'board'] as const
export type ViewLayout = (typeof VIEW_LAYOUTS)[number]

export interface ViewFilters {
  statuses?: WorkItemStatus[]
  projectId?: string
  assignee?: string // 'unassigned' | a member id
  cycleId?: string
  engineId?: string
  functionId?: string
}

export const views = pgTable(
  'views',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    layout: text('layout', { enum: VIEW_LAYOUTS }).notNull().default('list'),
    filters: jsonb('filters').$type<ViewFilters>(),
    createdByMemberId: text('created_by_member_id').references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceNameUnique: uniqueIndex('views_workspace_name_idx').on(table.workspaceId, table.name),
    workspaceIdx: index('views_workspace_idx').on(table.workspaceId),
  }),
)

export type View = typeof views.$inferSelect
export type InsertView = typeof views.$inferInsert

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
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
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
    workspaceOccurredIdx: index('events_workspace_occurred_idx').on(table.workspaceId, table.occurredAt),
    workspaceTypeIdx: index('events_workspace_type_idx').on(table.workspaceId, table.type),
    workItemIdx: index('events_work_item_idx').on(table.workItemId),
    memberIdx: index('events_member_idx').on(table.memberId),
    dedupeUnique: uniqueIndex('events_dedupe_idx').on(table.workspaceId, table.source, table.externalId),
  }),
)

export type Event = typeof events.$inferSelect
export type InsertEvent = typeof events.$inferInsert

// ---------------------------------------------------------------------------
// Native issue tracking — relations, watchers, templates, notifications
// ---------------------------------------------------------------------------

export const WORK_ITEM_RELATION_TYPES = ['blocks', 'duplicate', 'related'] as const
export type WorkItemRelationType = (typeof WORK_ITEM_RELATION_TYPES)[number]

// Directional edges between work items. Semantics by type:
//   blocks:    itemId blocks relatedItemId
//   duplicate: itemId is a duplicate of relatedItemId (the canonical item)
//   related:   symmetric; stored once, either direction
export const workItemRelations = pgTable(
  'work_item_relations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    relatedItemId: text('related_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    type: text('type', { enum: WORK_ITEM_RELATION_TYPES }).notNull(),
    createdByMemberId: text('created_by_member_id').references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    pairTypeUnique: uniqueIndex('work_item_relations_pair_type_idx').on(table.itemId, table.relatedItemId, table.type),
    itemIdx: index('work_item_relations_item_idx').on(table.itemId),
    relatedIdx: index('work_item_relations_related_idx').on(table.relatedItemId),
  }),
)

export type WorkItemRelation = typeof workItemRelations.$inferSelect
export type InsertWorkItemRelation = typeof workItemRelations.$inferInsert

export const WATCHER_REASONS = ['manual', 'creator', 'assigned', 'mentioned'] as const
export type WatcherReason = (typeof WATCHER_REASONS)[number]

// Subscriptions: who gets notified about a work item's events. Auto-created on
// create/assign; removable (and re-addable) manually.
export const workItemWatchers = pgTable(
  'work_item_watchers',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    reason: text('reason', { enum: WATCHER_REASONS }).notNull().default('manual'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    itemMemberUnique: uniqueIndex('work_item_watchers_item_member_idx').on(table.workItemId, table.memberId),
    memberIdx: index('work_item_watchers_member_idx').on(table.memberId),
  }),
)

export type WorkItemWatcher = typeof workItemWatchers.$inferSelect
export type InsertWorkItemWatcher = typeof workItemWatchers.$inferInsert

// Reusable pre-filled issue defaults ("Bug report", "Chore"…). `defaults` holds
// any subset of work-item fields; nulls/absent fields fall back to form input.
export interface WorkItemTemplateDefaults {
  title?: string
  description?: string
  kind?: WorkItemKind
  status?: WorkItemStatus
  priority?: number
  labels?: string[]
  estimate?: number
  assigneeMemberId?: string
  projectId?: string
}

export const workItemTemplates = pgTable(
  'work_item_templates',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    defaults: jsonb('defaults').$type<WorkItemTemplateDefaults>().notNull(),
    createdByMemberId: text('created_by_member_id').references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceNameUnique: uniqueIndex('work_item_templates_workspace_name_idx').on(table.workspaceId, table.name),
  }),
)

export type WorkItemTemplate = typeof workItemTemplates.$inferSelect
export type InsertWorkItemTemplate = typeof workItemTemplates.$inferInsert

// Inbox: one row per (recipient, event), fanned out at ingest time to watchers
// of the event's work item (excluding the actor). Read/snooze state lives here.
export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    workItemId: text('work_item_id').references(() => workItems.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at'),
    snoozedUntil: timestamp('snoozed_until'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    memberEventUnique: uniqueIndex('notifications_member_event_idx').on(table.memberId, table.eventId),
    memberReadIdx: index('notifications_member_read_idx').on(table.memberId, table.readAt),
    workspaceIdx: index('notifications_workspace_idx').on(table.workspaceId),
  }),
)

export type Notification = typeof notifications.$inferSelect
export type InsertNotification = typeof notifications.$inferInsert

// ---------------------------------------------------------------------------
// Automation — trigger/condition/action rules evaluated on the event bus.
// The event stream Beacon already has is the trigger source; this table is
// just "what to do when X happens", not a separate signal pipeline.
// ---------------------------------------------------------------------------

export const AUTOMATION_CONDITION_FIELDS = [
  'event.source',
  'workItem.status',
  'workItem.priority',
  'workItem.kind',
  'workItem.assigneeMemberId',
  'workItem.projectId',
  'workItem.labels',
] as const
export type AutomationConditionField = (typeof AUTOMATION_CONDITION_FIELDS)[number]

export const AUTOMATION_CONDITION_OPS = ['eq', 'neq', 'in', 'contains'] as const
export type AutomationConditionOp = (typeof AUTOMATION_CONDITION_OPS)[number]

export interface AutomationCondition {
  field: AutomationConditionField
  op: AutomationConditionOp
  value: string | number | string[]
}

export const AUTOMATION_ACTION_TYPES = ['set_status', 'set_assignee', 'set_priority', 'add_label', 'notify'] as const
export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number]

export interface AutomationAction {
  type: AutomationActionType
  // set_status: WorkItemStatus. set_assignee: memberId | null | "trigger_actor".
  // set_priority: 0-4. add_label: string. notify: memberId | "assignee".
  value: string | number | null
}

// One rule = one trigger event type. Admins create several rules for several
// triggers rather than one rule matching a list — keeps conditions legible.
export const automationRules = pgTable(
  'automation_rules',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    triggerEventType: text('trigger_event_type').notNull(),
    // ANDed together; empty/null = always match once the trigger fires.
    conditions: jsonb('conditions').$type<AutomationCondition[]>(),
    actions: jsonb('actions').$type<AutomationAction[]>().notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdByMemberId: text('created_by_member_id').references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index('automation_rules_workspace_idx').on(table.workspaceId),
    triggerIdx: index('automation_rules_trigger_idx').on(table.workspaceId, table.triggerEventType, table.enabled),
  }),
)

export type AutomationRule = typeof automationRules.$inferSelect
export type InsertAutomationRule = typeof automationRules.$inferInsert

// ---------------------------------------------------------------------------
// Project health updates — narrated status distinct from derived progress.
// ---------------------------------------------------------------------------

export const PROJECT_HEALTH = ['on_track', 'at_risk', 'off_track'] as const
export type ProjectHealth = (typeof PROJECT_HEALTH)[number]

export const projectUpdates = pgTable(
  'project_updates',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    health: text('health', { enum: PROJECT_HEALTH }).notNull(),
    body: text('body').notNull(),
    authorMemberId: text('author_member_id').references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index('project_updates_project_idx').on(table.projectId, table.createdAt),
    workspaceIdx: index('project_updates_workspace_idx').on(table.workspaceId),
  }),
)

export type ProjectUpdate = typeof projectUpdates.$inferSelect
export type InsertProjectUpdate = typeof projectUpdates.$inferInsert

// ---------------------------------------------------------------------------
// Integrations — every tool is just a signal source, none of them is "the" one
// ---------------------------------------------------------------------------

export const CONNECTION_PROVIDERS = ['linear', 'slack', 'google_calendar'] as const
export type ConnectionProvider = (typeof CONNECTION_PROVIDERS)[number]

// OAuth-style connections to external providers (GitHub lives on users/accounts).
// The connection belongs to the workspace; the OAuth token belongs to whoever
// connected it (connectedByUserId).
export const connections = pgTable(
  'connections',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    connectedByUserId: text('connected_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    provider: text('provider', { enum: CONNECTION_PROVIDERS }).notNull(),
    accessToken: text('access_token').notNull(), // encrypted
    externalUserId: text('external_user_id'),
    // The provider's own workspace/org (e.g. the Linear workspace), not ours
    providerWorkspaceId: text('provider_workspace_id'),
    providerWorkspaceName: text('provider_workspace_name'),
    config: jsonb('config').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceProviderUnique: uniqueIndex('connections_workspace_provider_idx').on(table.workspaceId, table.provider),
  }),
)

export type Connection = typeof connections.$inferSelect
export type InsertConnection = typeof connections.$inferInsert

export const SIGNAL_SOURCE_KINDS = ['github_repo', 'linear_project', 'linear_team', 'linear_workspace'] as const
export type SignalSourceKind = (typeof SIGNAL_SOURCE_KINDS)[number]

// A concrete stream Beacon watches: a repo, a Linear project/team, a channel…
// projectId maps the stream to a Beacon project so ingested signals attribute
// automatically; null means "General".
export const signalSources = pgTable(
  'signal_sources',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
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
    workspaceKindIdentifierUnique: uniqueIndex('signal_sources_workspace_kind_identifier_idx').on(
      table.workspaceId,
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
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull(),
    keyPrefix: text('key_prefix').notNull(), // first chars, for display
    lastUsedAt: timestamp('last_used_at'),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    keyHashUnique: uniqueIndex('api_keys_key_hash_idx').on(table.keyHash),
    workspaceIdx: index('api_keys_workspace_idx').on(table.workspaceId),
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
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
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
    // Independent org-chart tags, same as work_items — see "Org units" above.
    engineId: text('engine_id').references(() => engines.id, { onDelete: 'set null' }),
    functionId: text('function_id').references(() => functions.id, { onDelete: 'set null' }),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index('knowledge_documents_workspace_idx').on(table.workspaceId),
    engineIdx: index('knowledge_documents_engine_idx').on(table.engineId),
    functionIdx: index('knowledge_documents_function_idx').on(table.functionId),
  }),
)

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect
export type InsertKnowledgeDocument = typeof knowledgeDocuments.$inferInsert

export const knowledgeSignals = pgTable(
  'knowledge_signals',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
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
    workspaceIdx: index('knowledge_signals_workspace_idx').on(table.workspaceId),
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
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: INSIGHT_KINDS }).notNull(),
    severity: text('severity', { enum: ['info', 'warning', 'critical'] })
      .notNull()
      .default('info'),
    title: text('title').notNull(),
    detail: text('detail').notNull(),
    memberId: text('member_id').references(() => members.id, { onDelete: 'cascade' }),
    workItemId: text('work_item_id').references(() => workItems.id, { onDelete: 'cascade' }),
    // Set on project-scoped insights (e.g. "no activity") that aren't about
    // one work item — lets the generator dedupe per project, not just per kind.
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
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
    workspaceStatusIdx: index('insights_workspace_status_idx').on(table.workspaceId, table.status),
    workspaceKindIdx: index('insights_workspace_kind_idx').on(table.workspaceId, table.kind),
    projectIdx: index('insights_project_idx').on(table.projectId),
  }),
)

export type Insight = typeof insights.$inferSelect
export type InsertInsight = typeof insights.$inferInsert

// ---------------------------------------------------------------------------
// Docs — personal, block-based documents (BlockNote). Each doc has exactly one
// owner; it lives in that member's own space until shared. Sharing has two
// independent layers, same shape as Notion/Google Docs: a workspace-wide
// default (private, or "anyone in the workspace can view/edit") plus
// per-person overrides in docCollaborators. The owner always has full access
// and is the only one who can manage sharing or delete the doc.
// ---------------------------------------------------------------------------

export const DOC_SHARE_MODES = ['private', 'workspace'] as const
export type DocShareMode = (typeof DOC_SHARE_MODES)[number]

export const DOC_PERMISSIONS = ['view', 'edit'] as const
export type DocPermission = (typeof DOC_PERMISSIONS)[number]

export const docs = pgTable(
  'docs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerMemberId: text('owner_member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('Untitled'),
    // BlockNote's Block[] — an ordered tree of block objects (id, type, props,
    // content, children). Opaque to the server; only the editor interprets it.
    content: jsonb('content').$type<unknown[]>().notNull().default([]),
    shareMode: text('share_mode', { enum: DOC_SHARE_MODES }).notNull().default('private'),
    // Only meaningful when shareMode = 'workspace'.
    workspacePermission: text('workspace_permission', { enum: DOC_PERMISSIONS }).notNull().default('view'),
    // A third, separate tier: a public, unauthenticated, read-only link — like
    // Notion's "Share to web." Independent of shareMode/workspacePermission,
    // which both require being signed into this workspace. The token is only
    // ever looked up directly (never listed), so it doubles as the secret.
    publicShareEnabled: boolean('public_share_enabled').notNull().default(false),
    publicShareToken: text('public_share_token'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index('docs_workspace_idx').on(table.workspaceId),
    ownerIdx: index('docs_owner_idx').on(table.ownerMemberId),
    publicTokenUnique: uniqueIndex('docs_public_share_token_idx')
      .on(table.publicShareToken)
      .where(sql`${table.publicShareToken} is not null`),
  }),
)

export type Doc = typeof docs.$inferSelect
export type InsertDoc = typeof docs.$inferInsert

// Per-person share overrides. Only consulted for docs the viewer doesn't
// already own; a row here grants access regardless of shareMode.
export const docCollaborators = pgTable(
  'doc_collaborators',
  {
    id: text('id').primaryKey(),
    docId: text('doc_id')
      .notNull()
      .references(() => docs.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    permission: text('permission', { enum: DOC_PERMISSIONS }).notNull().default('view'),
    addedByMemberId: text('added_by_member_id').references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    docMemberUnique: uniqueIndex('doc_collaborators_doc_member_idx').on(table.docId, table.memberId),
    memberIdx: index('doc_collaborators_member_idx').on(table.memberId),
  }),
)

export type DocCollaborator = typeof docCollaborators.$inferSelect
export type InsertDocCollaborator = typeof docCollaborators.$inferInsert
