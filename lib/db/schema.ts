import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
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
    // Platform-wide admin, independent of any workspace's `members.role`. Not
    // settable through the app — grant only via a direct DB update.
    isSuperAdmin: boolean('is_super_admin').notNull().default(false),
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
  // One Vision/Mission statement per workspace, superadmin-only to view or
  // edit (see app/vision, app/mission). Null means "not written yet."
  vision: text('vision'),
  mission: text('mission'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Workspace = typeof workspaces.$inferSelect
export type InsertWorkspace = typeof workspaces.$inferInsert

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

// Ordered low → high; see lib/auth/roles.ts for the hierarchy helpers built
// on this order. superadmin sits above admin — every admin capability plus
// extras (Vision/Mission, granting/revoking superadmin itself).
export const ACCESS_ROLES = ['engineer', 'manager', 'admin', 'superadmin'] as const
export type AccessRole = (typeof ACCESS_ROLES)[number]

export const MEMBER_STATUSES = ['profile', 'invited', 'active'] as const
export type MemberStatus = (typeof MEMBER_STATUSES)[number]

// People in the workspace. Signals from every source are attributed to a member
// through identity aliases (GitHub login, agent name, email…).
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
    slackHandle: text('slack_handle'),
    // Free-form aliases used by coding agents / CI to identify the engineer
    aliases: jsonb('aliases').$type<string[]>(),
    skills: jsonb('skills').$type<string[]>(),
    // IANA timezone (e.g. "Asia/Kolkata") for calendar display + reminders;
    // captured from the browser on first calendar visit.
    timezone: text('timezone'),
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
    teamId: text('team_id').references(() => teams.id, { onDelete: 'set null' }),
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
    teamIdx: index('work_items_team_idx').on(table.teamId),
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
  teamId?: string
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

// Which of beacon-insights' two reporting paths produced an agent event —
// see the `instrumentation` column comment on `events` below.
export const EVENT_INSTRUMENTATIONS = ['hook', 'model'] as const
export type EventInstrumentation = (typeof EVENT_INSTRUMENTATIONS)[number]

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
    // Which repository the work happened in (e.g. "Intellina-Systems/beacon"),
    // for the multi-repo view — what work is being done where.
    repo: text('repo'),
    // Idempotency key from the source system (commit sha, delivery id…)
    externalId: text('external_id'),
    confidence: real('confidence'),
    // Correlates events emitted by the same coding-agent session (e.g. one
    // Claude Code conversation) — lets the model-authored path (a real
    // agent.planning/agent.blocked reason/agent.completed) and the
    // deterministic hook-authored path (session_started, throttled
    // heartbeats, test results) be joined back into one timeline even though
    // they're sent independently. Null for anything that isn't agent
    // telemetry (github/linear/cicd/... events never set this).
    sessionId: text('session_id'),
    // Which of the two beacon-insights paths produced this event — 'hook'
    // (deterministic, fires whether or not the model remembers anything) or
    // 'model' (the agent chose to send it). Distinct from `source`, which is
    // the ingestion channel (github/agent/manual/...), not this distinction.
    instrumentation: text('instrumentation', { enum: EVENT_INSTRUMENTATIONS }),
    occurredAt: timestamp('occurred_at').notNull(),
    ingestedAt: timestamp('ingested_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceOccurredIdx: index('events_workspace_occurred_idx').on(table.workspaceId, table.occurredAt),
    workspaceTypeIdx: index('events_workspace_type_idx').on(table.workspaceId, table.type),
    workItemIdx: index('events_work_item_idx').on(table.workItemId),
    memberIdx: index('events_member_idx').on(table.memberId),
    workspaceRepoIdx: index('events_workspace_repo_idx').on(table.workspaceId, table.repo),
    sessionIdx: index('events_session_idx').on(table.sessionId),
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

// Human discussion on a work item. Comments are mutable prose (people edit
// typos), so unlike status they are NOT derived from the event stream — but
// posting one still emits a `task.commented` event so the stream, the inbox,
// and every projection over it stay complete.
export const workItemComments = pgTable(
  'work_item_comments',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    authorMemberId: text('author_member_id').references(() => members.id, { onDelete: 'set null' }),
    // Markdown, including inline `![shot](/api/attachments/<id>)` embeds
    body: text('body').notNull(),
    editedAt: timestamp('edited_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    itemCreatedIdx: index('work_item_comments_item_created_idx').on(table.workItemId, table.createdAt),
    authorIdx: index('work_item_comments_author_idx').on(table.authorMemberId),
  }),
)

export type WorkItemComment = typeof workItemComments.$inferSelect
export type InsertWorkItemComment = typeof workItemComments.$inferInsert

// Files pinned to a work item — screenshots pasted into a description or
// comment, plus plain file uploads. Bytes live in the Supabase Storage
// "Uploaded_Files" bucket; Postgres only holds metadata plus the object's
// path. `lib/work-items/attachments.ts` is the only module that touches
// storage. See ATTACHMENT_MAX_BYTES for the size ceiling.
export const workItemAttachments = pgTable(
  'work_item_attachments',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    workItemId: text('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    // Set when the file was uploaded from a comment composer rather than the
    // description; the comment's deletion does not cascade — attachments stay
    // reachable from the item's Files list.
    commentId: text('comment_id').references(() => workItemComments.id, { onDelete: 'set null' }),
    uploadedByMemberId: text('uploaded_by_member_id').references(() => members.id, { onDelete: 'set null' }),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    // Object key inside the "Uploaded_Files" Supabase Storage bucket.
    storagePath: text('storage_path').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    itemIdx: index('work_item_attachments_item_idx').on(table.workItemId),
    commentIdx: index('work_item_attachments_comment_idx').on(table.commentId),
  }),
)

export type WorkItemAttachment = typeof workItemAttachments.$inferSelect
export type InsertWorkItemAttachment = typeof workItemAttachments.$inferInsert

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

export const CONNECTION_PROVIDERS = ['slack', 'google_calendar'] as const
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
    // The provider's own workspace/org (e.g. the Slack workspace), not ours
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

export const SIGNAL_SOURCE_KINDS = ['github_repo'] as const
export type SignalSourceKind = (typeof SIGNAL_SOURCE_KINDS)[number]

// A concrete stream Beacon watches: a repo, a channel…
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
    // e.g. "vercel/next.js" for a repo
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
// MCP OAuth — Beacon acting as an OAuth 2.1 authorization server for remote
// MCP clients (Claude, Cursor, ChatGPT…), so a connection can be authorized
// by browser instead of a pasted bcn_ key. Every existing OAuth flow in this
// codebase (GitHub, Vercel, Google Calendar) is Beacon as a *client*
// authenticating outward; these three tables are the only place Beacon
// issues credentials to someone else. All hash-only, like api_keys/invites
// above — nothing here is ever decrypted, only compared. Access tokens
// themselves are NOT a table: they're short-lived JWEs (lib/mcp/tokens.ts)
// carrying a grantId, verified by decrypting and checking this grant
// hasn't been revoked — no separate hash-compare table for them.
// ---------------------------------------------------------------------------

// A registered MCP client app (Claude Code, Cursor…). Global, not
// workspace-scoped — Dynamic Client Registration (RFC 7591) happens before
// anyone has authenticated or picked a workspace, exactly like registering a
// GitHub OAuth App. Registering grants zero data access by itself; real
// access only ever follows a member completing browser consent at
// /oauth/authorize. v1 is public/PKCE-only clients — no secret.
export const mcpOauthClients = pgTable('mcp_oauth_clients', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().unique(),
  clientName: text('client_name').notNull(),
  redirectUris: jsonb('redirect_uris').$type<string[]>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type McpOauthClient = typeof mcpOauthClients.$inferSelect
export type InsertMcpOauthClient = typeof mcpOauthClients.$inferInsert

// A single-use, ~60s-lived authorization code, exchanged for tokens at
// /api/oauth/token. `consumedAt` gives the same atomic single-use pattern
// invites.ts:claimInvite() uses (UPDATE ... WHERE consumedAt IS NULL
// RETURNING), closing the race where two token requests race the same code.
export const mcpAuthorizationCodes = pgTable(
  'mcp_authorization_codes',
  {
    id: text('id').primaryKey(),
    codeHash: text('code_hash').notNull(),
    clientId: text('client_id')
      .notNull()
      .references(() => mcpOauthClients.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    redirectUri: text('redirect_uri').notNull(),
    codeChallenge: text('code_challenge').notNull(),
    // Always 'S256' — OAuth 2.1 makes PKCE mandatory for public clients and
    // this server never accepts the plain method. Kept as a column (not a
    // hardcoded assumption downstream) so the token endpoint's comparison
    // stays honest about what it's actually checking.
    codeChallengeMethod: text('code_challenge_method').notNull(),
    scope: text('scope').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    consumedAt: timestamp('consumed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    codeHashIdx: uniqueIndex('mcp_authorization_codes_hash_idx').on(table.codeHash),
  }),
)

export type McpAuthorizationCode = typeof mcpAuthorizationCodes.$inferSelect
export type InsertMcpAuthorizationCode = typeof mcpAuthorizationCodes.$inferInsert

// The durable "this client can act as this member in this workspace" record
// — one row per active connection, what the UI lists and revokes. No access
// token lives here (see note above); `refreshTokenHash` is rotated on every
// refresh, with reuse of an already-rotated token revoking the whole grant
// (theft detection) rather than just failing the one request. Deleting the
// member cascades here so a removed member's grants can't outlive them —
// belt-and-braces alongside the JWE verification path already refusing a
// deactivated (not just deleted) member via getWorkspaceContextForMember.
export const mcpOauthGrants = pgTable(
  'mcp_oauth_grants',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => mcpOauthClients.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    lastUsedAt: timestamp('last_used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    revokedAt: timestamp('revoked_at'),
  },
  (table) => ({
    refreshTokenHashIdx: uniqueIndex('mcp_oauth_grants_refresh_hash_idx').on(table.refreshTokenHash),
    memberIdx: index('mcp_oauth_grants_member_idx').on(table.memberId),
    workspaceIdx: index('mcp_oauth_grants_workspace_idx').on(table.workspaceId),
  }),
)

export type McpOauthGrant = typeof mcpOauthGrants.$inferSelect
export type InsertMcpOauthGrant = typeof mcpOauthGrants.$inferInsert

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
    teamId: text('team_id').references(() => teams.id, { onDelete: 'set null' }),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index('knowledge_documents_workspace_idx').on(table.workspaceId),
    engineIdx: index('knowledge_documents_engine_idx').on(table.engineId),
    teamIdx: index('knowledge_documents_team_idx').on(table.teamId),
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
    // Nesting: null means top-level. Self-referencing FK, so a deleted parent
    // cascades to its children rather than orphaning them (matches Notion:
    // deleting a page deletes its sub-pages).
    parentId: text('parent_id').references((): AnyPgColumn => docs.id, { onDelete: 'cascade' }),
    // Fractional rank among siblings sharing the same parentId — same scheme
    // as lib/work-items/rank.ts, reused rather than reinvented.
    rank: text('rank'),
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
    parentIdx: index('docs_parent_idx').on(table.parentId),
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

// Lightweight presence: a per-(doc, member) heartbeat row, upserted every
// ~15s while a doc is open and read back as "who's here right now" (lastSeenAt
// within the last ~30s). Deliberately not real-time (no websocket, no Yjs) —
// polling is enough to answer "is someone else looking at this" and warn
// before a silent overwrite; true multiplayer is a separate, named fast-follow.
export const docPresence = pgTable(
  'doc_presence',
  {
    id: text('id').primaryKey(),
    docId: text('doc_id')
      .notNull()
      .references(() => docs.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
  },
  (table) => ({
    docMemberUnique: uniqueIndex('doc_presence_doc_member_idx').on(table.docId, table.memberId),
    docIdx: index('doc_presence_doc_idx').on(table.docId),
  }),
)

export type DocPresence = typeof docPresence.$inferSelect

// ---------------------------------------------------------------------------
// Daily plans — the one manual signal Beacon deliberately asks for: what a
// member intends to work on today. Freeform text the person types, plus
// optionally linked work items to show what they're on. One row per member
// per day; edits update in place. Every submit/edit also emits a
// plan.declared / plan.updated event, so intent lands on the timeline and
// feeds plan-vs-actual (planned items vs items that actually got activity).
// ---------------------------------------------------------------------------

export const DAILY_PLAN_STATUSES = ['pending', 'done'] as const
export type DailyPlanStatus = (typeof DAILY_PLAN_STATUSES)[number]

export const dailyPlans = pgTable(
  'daily_plans',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    // Local calendar day, 'YYYY-MM-DD'. One plan per member per day.
    date: text('date').notNull(),
    intention: text('intention').notNull(),
    workItemIds: jsonb('work_item_ids').$type<string[]>().notNull().default([]),
    status: text('status', { enum: DAILY_PLAN_STATUSES }).notNull().default('pending'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    memberDateUnique: uniqueIndex('daily_plans_member_date_idx').on(table.memberId, table.date),
    workspaceDateIdx: index('daily_plans_workspace_date_idx').on(table.workspaceId, table.date),
  }),
)

export type DailyPlan = typeof dailyPlans.$inferSelect
export type InsertDailyPlan = typeof dailyPlans.$inferInsert

// ---------------------------------------------------------------------------
// Calendar accounts — per-member OAuth connections to a personal calendar
// (Google today; the shape is provider-generic so Outlook can follow). Unlike
// `connections` (workspace-scoped, one row per provider), a calendar belongs
// to a person, so this is keyed by member and stores the refresh token +
// expiry that Google's short-lived access tokens require. Both tokens are
// encrypted at rest (lib/crypto.ts). syncToken drives incremental sync.
// ---------------------------------------------------------------------------

export const CALENDAR_PROVIDERS = ['google'] as const
export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number]

export const calendarAccounts = pgTable(
  'calendar_accounts',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: CALENDAR_PROVIDERS }).notNull().default('google'),
    accessToken: text('access_token').notNull(), // encrypted
    refreshToken: text('refresh_token'), // encrypted
    tokenExpiresAt: timestamp('token_expires_at'),
    externalEmail: text('external_email'),
    calendarId: text('calendar_id').notNull().default('primary'),
    // Incremental sync position from the Calendar API; cleared on 410 → full resync.
    syncToken: text('sync_token'),
    enabled: boolean('enabled').notNull().default(true),
    lastSyncedAt: timestamp('last_synced_at'),
    lastSyncError: text('last_sync_error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    memberUnique: uniqueIndex('calendar_accounts_member_idx').on(table.memberId),
    workspaceIdx: index('calendar_accounts_workspace_idx').on(table.workspaceId),
  }),
)

export type CalendarAccount = typeof calendarAccounts.$inferSelect
export type InsertCalendarAccount = typeof calendarAccounts.$inferInsert

// ---------------------------------------------------------------------------
// Native calendar — a first-class, Google-grade calendar Beacon owns. A
// `calendar` is a container; `calendar_events` are its (single or recurring)
// masters; `calendar_event_overrides` carry per-occurrence exceptions
// (RECURRENCE-ID / EXDATE); attendees, reminders, and shares hang off events
// and calendars. Every mutation also appends a Beacon event (source
// 'calendar') so the calendar feeds Pulse/Timeline — same dual pattern as
// work_items (stored entity that also emits events).
// ---------------------------------------------------------------------------

export const CALENDAR_VISIBILITY = ['private', 'workspace'] as const
export type CalendarVisibility = (typeof CALENDAR_VISIBILITY)[number]

export interface ReminderSpec {
  method: 'popup' | 'email'
  minutesBefore: number
}

export const calendars = pgTable(
  'calendars',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerMemberId: text('owner_member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color').notNull().default('#3b82f6'),
    timezone: text('timezone').notNull().default('UTC'),
    isPrimary: boolean('is_primary').notNull().default(false),
    visibility: text('visibility', { enum: CALENDAR_VISIBILITY }).notNull().default('private'),
    // Set when this calendar mirrors an external source (e.g. Google import).
    // Its events are read-only in Beacon.
    externalProvider: text('external_provider'),
    defaultReminders: jsonb('default_reminders').$type<ReminderSpec[]>().notNull().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index('calendars_workspace_idx').on(table.workspaceId),
    ownerIdx: index('calendars_owner_idx').on(table.ownerMemberId),
  }),
)

export type Calendar = typeof calendars.$inferSelect
export type InsertCalendar = typeof calendars.$inferInsert

export const CALENDAR_EVENT_STATUSES = ['confirmed', 'tentative', 'cancelled'] as const
export type CalendarEventStatus = (typeof CALENDAR_EVENT_STATUSES)[number]

export const CALENDAR_EVENT_VISIBILITY = ['default', 'public', 'private'] as const
export type CalendarEventVisibility = (typeof CALENDAR_EVENT_VISIBILITY)[number]

export const CALENDAR_EVENT_TRANSPARENCY = ['opaque', 'transparent'] as const
export type CalendarEventTransparency = (typeof CALENDAR_EVENT_TRANSPARENCY)[number]

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    calendarId: text('calendar_id')
      .notNull()
      .references(() => calendars.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('(No title)'),
    description: text('description'),
    location: text('location'),
    // Null inherits the calendar's color.
    color: text('color'),
    // startAt is the DTSTART instant; startTimezone is the wall-clock zone it
    // was authored in — required to expand recurrences correctly across DST.
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    startTimezone: text('start_timezone').notNull().default('UTC'),
    endTimezone: text('end_timezone').notNull().default('UTC'),
    allDay: boolean('all_day').notNull().default(false),
    // RFC 5545 RRULE (e.g. "FREQ=WEEKLY;BYDAY=MO,WE"); null = single event.
    rrule: text('rrule'),
    // Cached last-possible occurrence (UNTIL/COUNT horizon) for range pruning;
    // null for single events or unbounded rules.
    recurrenceEndAt: timestamp('recurrence_end_at', { withTimezone: true }),
    status: text('status', { enum: CALENDAR_EVENT_STATUSES }).notNull().default('confirmed'),
    visibility: text('visibility', { enum: CALENDAR_EVENT_VISIBILITY }).notNull().default('default'),
    transparency: text('transparency', { enum: CALENDAR_EVENT_TRANSPARENCY }).notNull().default('opaque'),
    organizerMemberId: text('organizer_member_id').references(() => members.id, { onDelete: 'set null' }),
    conferenceUrl: text('conference_url'),
    externalProvider: text('external_provider'),
    externalId: text('external_id'),
    createdByMemberId: text('created_by_member_id').references(() => members.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    calendarStartIdx: index('calendar_events_calendar_start_idx').on(table.calendarId, table.startAt),
    workspaceStartIdx: index('calendar_events_workspace_start_idx').on(table.workspaceId, table.startAt),
    externalUnique: uniqueIndex('calendar_events_external_idx')
      .on(table.workspaceId, table.externalProvider, table.externalId)
      .where(sql`${table.externalId} is not null`),
  }),
)

export type CalendarEvent = typeof calendarEvents.$inferSelect
export type InsertCalendarEvent = typeof calendarEvents.$inferInsert

// Per-occurrence exceptions to a recurring master. cancelled=true is an EXDATE
// (occurrence removed); otherwise the non-null columns override just that one
// occurrence (Google's "edit this event").
export const calendarEventOverrides = pgTable(
  'calendar_event_overrides',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    masterEventId: text('master_event_id')
      .notNull()
      .references(() => calendarEvents.id, { onDelete: 'cascade' }),
    // The original (un-overridden) start of the occurrence being modified —
    // RFC 5545 RECURRENCE-ID.
    recurrenceDate: timestamp('recurrence_date', { withTimezone: true }).notNull(),
    cancelled: boolean('cancelled').notNull().default(false),
    title: text('title'),
    description: text('description'),
    location: text('location'),
    startAt: timestamp('start_at', { withTimezone: true }),
    endAt: timestamp('end_at', { withTimezone: true }),
    allDay: boolean('all_day'),
    status: text('status', { enum: CALENDAR_EVENT_STATUSES }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    masterRecurrenceUnique: uniqueIndex('calendar_event_overrides_master_recurrence_idx').on(
      table.masterEventId,
      table.recurrenceDate,
    ),
  }),
)

export type CalendarEventOverride = typeof calendarEventOverrides.$inferSelect
export type InsertCalendarEventOverride = typeof calendarEventOverrides.$inferInsert

export const ATTENDEE_ROLES = ['required', 'optional'] as const
export type AttendeeRole = (typeof ATTENDEE_ROLES)[number]

export const ATTENDEE_RESPONSES = ['needsAction', 'accepted', 'declined', 'tentative'] as const
export type AttendeeResponse = (typeof ATTENDEE_RESPONSES)[number]

export const eventAttendees = pgTable(
  'event_attendees',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .references(() => calendarEvents.id, { onDelete: 'cascade' }),
    // Internal guest (member) or external (email only).
    memberId: text('member_id').references(() => members.id, { onDelete: 'cascade' }),
    email: text('email'),
    role: text('role', { enum: ATTENDEE_ROLES }).notNull().default('required'),
    responseStatus: text('response_status', { enum: ATTENDEE_RESPONSES }).notNull().default('needsAction'),
    isOrganizer: boolean('is_organizer').notNull().default(false),
    comment: text('comment'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    eventMemberUnique: uniqueIndex('event_attendees_event_member_idx')
      .on(table.eventId, table.memberId)
      .where(sql`${table.memberId} is not null`),
    eventEmailUnique: uniqueIndex('event_attendees_event_email_idx')
      .on(table.eventId, table.email)
      .where(sql`${table.email} is not null`),
    memberIdx: index('event_attendees_member_idx').on(table.memberId),
  }),
)

export type EventAttendee = typeof eventAttendees.$inferSelect
export type InsertEventAttendee = typeof eventAttendees.$inferInsert

export const REMINDER_METHODS = ['popup', 'email'] as const
export type ReminderMethod = (typeof REMINDER_METHODS)[number]

export const eventReminders = pgTable(
  'event_reminders',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .references(() => calendarEvents.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    method: text('method', { enum: REMINDER_METHODS }).notNull().default('popup'),
    minutesBefore: integer('minutes_before').notNull().default(10),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    eventMemberIdx: index('event_reminders_event_member_idx').on(table.eventId, table.memberId),
  }),
)

export type EventReminder = typeof eventReminders.$inferSelect
export type InsertEventReminder = typeof eventReminders.$inferInsert

export const CALENDAR_SHARE_ROLES = ['freeBusy', 'reader', 'writer', 'owner'] as const
export type CalendarShareRole = (typeof CALENDAR_SHARE_ROLES)[number]

export const calendarShares = pgTable(
  'calendar_shares',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    calendarId: text('calendar_id')
      .notNull()
      .references(() => calendars.id, { onDelete: 'cascade' }),
    sharedWithMemberId: text('shared_with_member_id').references(() => members.id, { onDelete: 'cascade' }),
    sharedWithEmail: text('shared_with_email'),
    role: text('role', { enum: CALENDAR_SHARE_ROLES }).notNull().default('reader'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    calendarMemberUnique: uniqueIndex('calendar_shares_calendar_member_idx')
      .on(table.calendarId, table.sharedWithMemberId)
      .where(sql`${table.sharedWithMemberId} is not null`),
    sharedMemberIdx: index('calendar_shares_shared_member_idx').on(table.sharedWithMemberId),
  }),
)

export type CalendarShare = typeof calendarShares.$inferSelect
export type InsertCalendarShare = typeof calendarShares.$inferInsert

// ---------------------------------------------------------------------------
// Ask Beacon — persisted chat history. One row per conversation; the full
// UIMessage array lives in `messages` verbatim (text/tool-call/tool-approval/
// reasoning parts, whatever shape the `ai` package produces) — same
// "opaque JSON, only the client interprets it" choice docs.content makes for
// BlockNote's Block[]. This table (and its FKs/indexes) already existed live
// pre-dating this repo's own tracking of it — `scope` is the only actual
// addition this migration makes.
// ---------------------------------------------------------------------------

export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    // Starts as the literal default below; renamed to a derived summary of
    // the first user message the first time the conversation is persisted.
    title: text('title').notNull().default('New chat'),
    messages: jsonb('messages').$type<unknown[]>().notNull().default([]),
    // Mirrors ChatScope from hooks/use-beacon-chat.ts, so resuming a
    // team/engine-scoped conversation keeps answering from that scope.
    scope: jsonb('scope').$type<{ engineId?: string | null; teamId?: string | null }>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    memberIdx: index('chat_conversations_member_idx').on(table.memberId, table.updatedAt),
    workspaceIdx: index('chat_conversations_workspace_idx').on(table.workspaceId),
  }),
)

export type ChatConversation = typeof chatConversations.$inferSelect
export type InsertChatConversation = typeof chatConversations.$inferInsert
