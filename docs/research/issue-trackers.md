# Issue Tracker Landscape: Jira, GitHub Issues/Projects, Shortcut, Height

> Research compiled 2026-07-17 from Atlassian, GitHub, Shortcut, and Height documentation by a Claude research agent. Part of the competitive research set in `docs/research/`. See `SYNTHESIS.md` for cross-product conclusions.

> Note up front: **Height shut down on September 24, 2025**. It remains highly relevant as a design reference — chat-per-task, attributes, smart lists, autonomous AI map unusually well to Beacon's event-stream architecture — but it is not a live competitor.

---

## 1. Jira (primary, deepest)

### 1.1 Issue types & hierarchy

- **Standard hierarchy**: Epic (level 1) → standard types (Story, Task, Bug — level 0) → Subtask (level -1). Subtasks cannot exist without a parent and cannot have subtasks.
- **Custom issue types**: unlimited, site-wide, grouped into **issue type schemes** assigned per project (company-managed).
- **Extended hierarchy** (Premium "Plans"): admins add levels *above* Epic (Initiative → …), mapped to custom types; renders only in Plans, not boards.
- **Two project archetypes**: **company-managed** (shared, reusable schemes: workflow/issue-type/screen/field-config/permission/notification schemes) vs **team-managed** (self-contained, simpler, non-reusable). Jira's answer to "central governance vs team autonomy" — a tension Beacon will hit too.
- Parent linkage is a single `parent` field (epic link and parent link unified in the modern API).

### 1.2 Workflow engine (the crown jewel)

A workflow is a directed graph of **statuses** and **transitions**; **workflow schemes** map workflows to issue types within one project.

- **Statuses** belong to one of three fixed **status categories**: To Do (grey), In Progress (blue), Done (green). Categories are what reports, boards, and rollups key off — arbitrary custom statuses stay legible because they collapse into 3 canonical buckets. *The single most transferable idea for Beacon.*
- **Transitions** are directed edges (can be *global*: any status → X). Each transition can carry five kinds of rules:
  - **Triggers** — auto-fire on dev-tool events (branch created, commit pushed, PR opened/merged, review approved).
  - **Conditions** — gate *who can see/execute* (assignee/reporter, role/group, field value, sub-tasks-all-resolved). Failing hides the button.
  - **Validators** — check *input* at execution (required fields on transition screen, regex, permission, date comparisons). Failure blocks; post functions never run.
  - **Post functions** — side effects: update/clear field, assign to lead/reporter, fire an event (feeds notification schemes and webhooks), trigger webhook, copy values. Every transition has mandatory system post functions (update issue, persist history, reindex, fire event).
  - **Transition screens** — optional form mid-transition ("Resolve" demands Resolution + Fix Version).
- **Transition/status properties** — key-value pairs, e.g. `jira.issue.editable=false` freezes editing in a status; `jira.permission.*` overrides permissions per status.
- Editing is **draft → publish**; removing statuses forces a bulk migration mapping.

**Lesson for Beacon**: full graph-with-rules workflows are the most-imitated and most-cursed part of Jira. Durable subset: status categories, per-team status sets, a small set of transition guards, event-firing on transition — which Beacon's event stream models natively.

### 1.3 Boards: Scrum vs Kanban

- A board is **a view over a saved JQL filter**, not a container. One project → many boards; one board can span many projects. Config: **column→status mapping** (many statuses per column), **swimlanes** (epic/assignee/query), **quick filters** (JQL chips), card colors/layout, estimation statistic.
- **Scrum board** = Backlog + active Sprint + reports. **Kanban** = continuous flow, per-column **WIP limits** (min/max, column turns red), optional "Kanplan" backlog.
- Board-level **estimation config**: story points, original time estimate, or issue count.

### 1.4 Sprints

- Created from backlog (future sprints stack); states: future → active → closed. Attributes: name, goal, start/end. **Parallel sprints** toggle.
- **Scope change tracking**: once a sprint starts, the burndown log records every issue added/removed and estimate change with timestamps; Sprint Report marks issues added after start with an asterisk. Mechanically *an event log about sprint membership* — exactly Beacon's architecture (`sprint.item_added` / `sprint.item_removed` / `estimate.changed` events reproduce it for free).
- **Velocity chart**: commitment (estimate at start) vs completed, trailing window. **Burndown/burnup**, Sprint Report, Cumulative Flow, Control Chart (cycle time), Release burndown.
- On completion, incomplete issues route to backlog or next sprint (sprint history preserved — `sprint` field is multi-valued historically).

### 1.5 Backlog ranking: LexoRank

- Global, unique, alphanumeric **Rank** field. Ordering = lexicographic sort of rank strings.
- Insert-between generates a string midway between neighbors; strings grow with repeated insertion, so a **background rebalancing service** rewrites ranks across three buckets without locking.
- Rank is **orthogonal to Priority** — priority is importance; rank is actual work order. API: `PUT /rest/agile/1.0/issue/rank` with `rankBeforeIssue`/`rankAfterIssue`.
- Modern equivalents: fractional indexing, Linear's float `sortOrder`. For Postgres: `rank text` + fractional-index library + periodic rebalance.

### 1.6 Components, versions/releases

- **Components**: per-project subdivisions ("API", "iOS") with a **component lead** and a **default assignee rule** (component lead / project lead / unassigned) — auto-routing at creation. Multi-valued.
- **Versions**: release containers; issues carry `fixVersion` (multi) + `affectedVersion`. Releases hub: unreleased/released/archived, progress bars, release notes, release burndown.

### 1.7 Custom fields, screens, field configurations

- Dozens of field types incl. cascading select, user/group pickers, version pickers. **Contexts**: one field, different option sets/defaults per project or issue type.
- **Screens** (which fields appear on create/edit/view and transitions) + **field configurations** (required/hidden/renderer) + schemes per issue type per project.
- Chronic failure mode: unbounded field proliferation ("same field created 9 times"). Beacon's antidote: small workspace-level field registry with explicit scoping.

### 1.8 JQL

- `project = BCN AND status CHANGED FROM "In Progress" TO "Blocked" AFTER -7d AND assignee = currentUser() ORDER BY Rank`.
- Distinctive operators: `~` (contains), `WAS`, `WAS IN`, `CHANGED` (with `BY`, `AFTER`, `DURING`) — **history-aware querying**, possible only because Jira keeps a changelog. Functions: `currentUser()`, `openSprints()`, `startOfWeek(-1)`, `membersOf()`, `linkedIssues()`.
- JQL is the universal substrate: boards, saved filters (sharable, email-subscribable), automation conditions, dashboards, search API. Beacon's history-aware analogue is trivially derivable from `events` — a genuine differentiation opportunity.

### 1.9 Permissions & roles

- Global permissions, then per-project **permission schemes**: ~40 granular permissions (Browse, Create/Edit/Delete, Transition, Resolve, Assign, **Assignable User**, Manage Sprints, Schedule, Link, Comment, Log Work, Administer…) granted to **project roles**/groups/users/reporter/assignee.
- **Project roles** are the indirection layer: schemes reference roles; each project binds people to roles — one scheme serves hundreds of projects.
- **Issue security schemes**: per-issue visibility levels.
- Beacon's 3-tier accessRole + team leads is deliberately simpler; the Jira idea worth stealing: *"assignable user" as a distinct permission* and role-based capability checks separate from visibility.

### 1.10 Notification schemes & watchers

- **Notification schemes** map ~15 events (Created/Updated/Assigned/Resolved/Closed/Commented/Moved, Work Logged, sprint events, custom workflow events) → recipients (Assignee, Reporter, Watchers, Project Lead, Component Lead, role, group, user, custom field value).
- **Watchers**: any user can watch an issue (or be added); watchers receive scheme-routed events. Jira's email-spam reputation is the cautionary tale — default to digests and in-app.

### 1.11 Automation (Atlassian Automation)

- Rule = **Trigger → (Conditions) → Actions**, with **branches** ("for each sub-task / linked issue / JQL result…").
- **Triggers**: issue created/updated/transitioned, field changed, comment added, **scheduled** (cron + JQL feed), incoming webhook, dev events (PR merged, build failed), sprint started/completed, version released, **manual ("rule as button")**.
- **Conditions**: JQL, field compare, user, related-issues ("all sub-tasks done"), if/else blocks.
- **Actions**: edit fields, transition, assign (incl. **round-robin/balanced** strategies), create issue/sub-tasks, clone, comment, email/Slack/Teams, **outbound web request**, create variable, lookup issues, manage watchers, link.
- **Smart values**: `{{issue.summary}}`, `{{now.plusBusinessDays(2)}}`, list functions, math, conditional logic — a full templating DSL.
- Governance: rule actor, project vs global scope, per-execution audit log, monthly run limits.
- Canonical uses: auto-close stale, sum points to epic, auto-assign by component, escalate blocked > 3 days. **Beacon note**: the append-only event stream *is* an automation trigger bus already — a `rules` table evaluated in the ingest path gets 80% cheaply.

### 1.12 Jira Product Discovery (basics)

- Separate project type for **ideas**. Ideas carry rating/**weighted formula fields** (RICE from impact/effort) and roll-ups.
- **Insights**: evidence attached to ideas — customer quotes, tickets, analytics; insight count/weight feeds scoring.
- **Views**: List, **Matrix** (impact × effort scatter), Board, Timeline.
- **Discovery → delivery**: an idea links to epics; delivery progress rolls back. Adjacent to Beacon's `knowledgeSignals` (user_need/feature_request/pain_point) — Beacon already has raw material for an "evidence attached to work" loop none of Linear/GitHub/Shortcut natively have.

### 1.13 API & webhooks

- **REST v3**: `POST /issue` with `fields` map (`project.key`, `issuetype`, `summary`, `description` as ADF JSON, `assignee.accountId`, `priority`, `labels`, `parent`, `customfield_XXXXX`). **Status is not writable** — `GET /issue/{key}/transitions` then `POST` a transition id (workflow rules enforced server-side). `createmeta`/`editmeta` discovery tells clients which fields/values are valid — the pattern behind generic Jira form UIs. Bulk create; JQL search.
- **Agile REST** (`/rest/agile/1.0`): boards, sprints (create/start/close, move issues), backlog, epics, rank.
- **Webhooks**: `jira:issue_created/updated/deleted`, comment/worklog/sprint/version; **JQL filters** scope which issues fire; payload includes issue snapshot + **changelog diff**.
- Forge/Connect app platform: UI extension points, entity properties (arbitrary KV per issue for apps).

---

## 2. GitHub Issues & GitHub Projects

### 2.1 Issues core

- Minimal primitive: title + Markdown body + comments, repo-scoped, sequential `#number`. Reactions, mentions, edit history.
- **Issue types** (GA Apr 2025): **org-level** classification (defaults Bug/Feature/Task; ~25/org, color + description) — consistent across repos, filterable org-wide (`type:bug`), REST-manageable.
- **Sub-issues** (GA Apr 2025): parent/child up to **100 per parent, 8 levels deep**; progress bars on parents; Projects group/filter by parent. Cross-repo parenting within the org.
- **Issue dependencies** (2025): blocked-by/blocking surfaced on the issue.
- **Labels**: repo-scoped (org default set copies to new repos); triple duty as type/priority/status in label-only workflows.
- **Milestones**: repo-scoped buckets with due date, progress %, description.
- **Assignees**: up to **10 per issue** — true multi-assignee.
- **Templates & forms**: `.github/ISSUE_TEMPLATE/` — Markdown templates or **YAML issue forms** (structured `body:` schema — `input`, `textarea`, `dropdown`, `checkboxes`, `markdown`, per-field `validations: required`) + `config.yml` chooser (contact links, `blank_issues_enabled: false`). Forms pre-set labels/assignees/projects/type. Best-in-class *structured intake*.
- **Task lists**: `- [ ]` checkboxes; referencing an issue renders its status; one-click convert-to-issue.
- **PR ↔ issue linking**: closing keywords — `close(s|d)`, `fix(es|ed)`, `resolve(s|d)` + `#123` — auto-close **when the PR merges to the default branch** and create a visible linked-PR relationship (also settable in the Development panel). "Create a branch" from an issue. The mechanic Beacon's GitHub sync should exploit hardest.

### 2.2 Projects (v2)

- Org/user-level **table/board/roadmap over items** (issues, PRs, **draft issues** — quick-add rows promotable later).
- **Fields**: up to 50/project. Types: **text, number, date, single-select, iteration**; plus built-ins (assignees, labels, milestone, repository, reviewers, parent issue, sub-issue progress). "Status" is just a default single-select — board columns are its options.
- **Iteration field**: sprint-like — fixed cadence, auto-generates future iterations, supports **breaks**, groups views, filter tokens `@current`, `@next`, `@previous`. Multiple iteration fields allowed.
- **Views**: saved tabs (table/board/roadmap), independent filter/group/sort/**slice-by**, field visibility, swimlanes. Manual ordering persists per view (`updateProjectV2ItemPosition` — fractional positioning).
- **Built-in workflows**: item added → set Status; issue/PR closed → set Status; PR merged → set Status; review approved → set field; **auto-add** items matching a repo search; **auto-archive** matching a filter (`is:closed updated:<-2w`); auto-close stale. Escape hatch: **GitHub Actions** + GraphQL — infinitely programmable but DIY.
- **Insights** (paid): current charts (bar/column/line/stacked-area over any field grouping) and **historical charts** (Status burn-up). No native velocity/burndown per iteration.
- Org-level **project templates**; project **status updates** (on track / at risk journal). Limits: 50 fields, 50 views, ~1,200 items/view visible, 10k archived.

### 2.3 API & webhooks

- **Issues: REST** (`POST /repos/{owner}/{repo}/issues` — `title`, `body`, `assignees[]`, `labels[]`, `milestone`, `type`) and GraphQL. Sub-issue REST endpoints (2025).
- **Projects v2: GraphQL only** — `createProjectV2`, `addProjectV2ItemById` then a *separate* `updateProjectV2ItemFieldValue` per field (no atomic add-with-fields), `addProjectV2DraftIssue`, `updateProjectV2ItemPosition`. Clunky but complete.
- **Webhooks**: `issues` (opened/edited/closed/assigned/labeled/typed/…), `issue_comment`, `milestone`, `label`, org-level `projects_v2`/`projects_v2_item`/`projects_v2_status_update`. Fine-grained PATs / App installation tokens.

### 2.4 GitHub vs Linear

GitHub-only strengths: issues in the same permission/notification model as code; closing keywords + Development panel; validated issue forms; 10 assignees; draft issues; Actions as unbounded automation; community mechanics (reactions-as-voting, public triage). Weaknesses: no native cycles/velocity, no priority primitive, no workflow rules, per-view ordering, repo-scoped labels/milestones fragment org process.

---

## 3. Shortcut

### 3.1 Object model

- **Story** (types: **feature / bug / chore**) — always in exactly one **Workflow State**.
- **Epic** = stories across teams/workflows; own epic workflow (To Do/In Progress/Done, customizable) + **Epic Progress** rollups.
- **Objectives** (renamed from Milestones, Jan 2024): top-level goals holding epics; **Tactical** or **Strategic** (with **Key Results** metric targets → OKR tracking). A native OKR layer neither Jira core nor Linear has in that form.
- **Iteration** = time-boxed sprint container spanning epics/workflows; owns burndown/velocity; assignable to a Team.
- **Teams** ("Groups" in the API) are first-class: stories/epics/iterations can belong to a team.
- **Workflows per team**: a Workflow is a named set of **states**, each in one of three categories — **Unstarted / Started / Done**. Workflows ↔ Teams are **many-to-many**. No transition graph — any state to any state; simplicity is the point.
- **Story anatomy**: requester + **multiple owners**, followers, estimate (workspace-configurable **point scale** or disabled), deadline, labels (workspace-wide), **tasks** (checklists with per-task owners), **story links** (blocks/duplicates/relates), custom fields (built-in optional: Priority, Severity, Product Area, Skill Set + custom selects), attachments, comments with reactions.
- **Story templates**: admin-managed; any draft saveable as template with every field pre-set; deep-linkable.
- **Docs**: native collaborative docs with templates (PRD, OKRs, sprint planning), relatable to stories/epics.
- **Reporting**: burndown per iteration, velocity, cycle/lead time, CFD — keyed off state categories.
- **VCS integration**: branch naming (`…/sc-123/…`) + PR events auto-move stories through mapped states.

### 3.2 API & webhooks

- **REST v3** (`api.app.shortcut.com/api/v3`), `Shortcut-Token` header, OpenAPI published. `POST /stories` accepts the whole story in one call: name, description, type, workflow_state_id, epic_id, iteration_id, group_id (team), owner_ids[], follower_ids[], estimate, labels[] (inline create-by-name), tasks[], story_links[], deadline, custom_fields[], **external_id for sync idempotency**. Bulk endpoints (`/stories/bulk`); search with operator syntax (`owner:jane state:"In Progress"`).
- **Webhooks** (v1): single stream, payload with `actions[]` (entity_type, action, diffs), HMAC-SHA-256 `Payload-Signature`.

### 3.3 Shortcut vs Linear

Shortcut-only: multiple owners; multiple workflows per team; OKR layer; story types enum; tasks-with-owners inside stories; configurable point scales with real velocity/burndown. Lacks vs Linear: cycles automation polish, triage inbox, SLAs, keyboard culture.

---

## 4. Height (shut down Sept 2025 — design reference)

What made it structurally different:

1. **Chat-per-task**: every task's comments were a **real-time chat thread** — presence, typing indicators; any chat message convertible into a subtask in one action. Killed the "discuss in Slack, decide nowhere" split. For Beacon: task-scoped chat is just another event type (`chat.message` with `workItemId`), doubling as AI context.
2. **Attributes system**: all task metadata — status, **multiple assignees**, priority, dates, estimate, unlimited **custom attributes** (select, multi-select, text, number, date, person, checkbox) — in one uniform workspace-level registry. Views filter/group/sort by any attribute uniformly. No screens/schemes bureaucracy: one flat global field system.
3. **Smart lists**: lists were **saved filters, not containers** — a task could appear in many lists simultaneously; lists updated in real time as attributes changed; each list had its own view config (spreadsheet, kanban, calendar, gantt) and sections. "Views over one pool of items," executed most purely.
4. **Autonomous AI ("Copilot", Height 2.0)**: explicit thesis was *autonomous project management* — **auto bug triage** (categorize, set attributes, route, detect duplicates), **backlog pruning** (flag stale/duplicates), **spec updates** (decision made in task chat → Copilot proposes updating the spec), **standup generation** from activity, auto-naming, chat→subtasks. Height 2.0 exposed the AI's activity and reasoning as a feed. Closest philosophical cousin to Beacon — Height derived *actions* from signals; Beacon derives *status and insights* from events. The shutdown suggests distribution, not thesis, failed.
5. Also: command palette everywhere, inline quick-add, endless subtask nesting, GitHub branch linking (`T-123`), public REST API + CLI.

---

## 5. Cross-cutting comparison

**(a) Issue creation UX** — Jira: create modal driven by screens/required fields (heavy), bulk CSV, email-to-issue. GitHub: **YAML issue forms** (validated structured intake), draft issues. Shortcut: quick-create + admin templates. Height: inline quick-add anywhere. Linear: fastest quick-add + per-team templates.

**(b) Multiple assignees** — Jira: single (philosophy). GitHub: 10. Shortcut: multiple owners. Height: multiple. Linear: single + subscribers. Beacon currently single.

**(c) Team/project scoping** — Jira: project is the hard container; boards cut across via JQL. GitHub: repo container; org-level types/Projects paper over fragmentation. Shortcut: Team first-class on stories/epics/iterations; workflows attach to teams (M2M). Linear: team is the hard container; projects span teams. **Beacon's shape (workspace → projects; teams orthogonal via `projectTeams`) is closest to Shortcut/Linear-projects; open question: whether work items need a `teamId` for routing/workflow selection (Shortcut/Linear say yes).**

**(d) Estimation** — Jira: points or time-tracking per board. GitHub: convention only. Shortcut: configurable point scales, native velocity. Linear: per-team scales. Beacon: none yet.

**(e) Ordering** — Jira: **LexoRank, one global canonical rank**. GitHub: per-view manual position. Shortcut/Height: per-context manual. Linear: fractional float per context. Fork: canonical global rank (Jira) vs per-view order (GitHub). For Beacon: a single `rank` on work_items (Jira model) is simpler, matches "one source of truth".

**(f) Status workflow customization** — Jira: full graph engine (max power, max admin tax). GitHub: open/closed + close reason; Projects single-select without rules. Shortcut: named state lists in 3 categories per team, no transition graph. Linear: per-team lists in 5 categories. **Industry convergence: custom state names mapped to fixed canonical categories, no transition graphs.** Beacon's 7 fixed statuses are effectively the categories already.

**(g) Notifications/watchers** — consensus primitive: **watchers/subscribers join table + auto-subscribe on interaction + a personal inbox**. Jira's schemes = cautionary tale for email volume.

**(h) API create shape** — Jira: `fields` map + transitions endpoint for status + createmeta discovery. GitHub: simple REST issues; GraphQL-only Projects with per-field update dance. Shortcut: **one-call create with everything inline incl. external_id**. Linear: GraphQL `issueCreate`. Lesson for Beacon: Shortcut-style one-call create + idempotency key, plus a discovery endpoint if fields become dynamic.

**(i) Webhooks** — Jira: JQL-scoped, changelog payloads. GitHub: mature per-event + HMAC + App model. Shortcut: single action-diff stream, HMAC. Linear: per-model, signed. Beacon is a consumer today; as a tracker it must also *emit* — the `events` table is literally the outbox; add delivery.

### What each does that Linear does NOT

- **Jira**: custom fields with contexts; custom issue types + hierarchy levels; transition rules; JQL incl. history operators (`WAS`, `CHANGED`); permission/notification/issue-security schemes; time tracking & worklogs; components with default assignees; versions/releases; parallel sprints; automation DSL with smart values; JPD insights/scoring; boards spanning projects by query.
- **GitHub**: multi-assignee (10); validated public issue intake; closing-keyword PR automation in the same platform as code; draft issues; Actions as unbounded automation; community mechanics; org-wide issue types across thousands of repos.
- **Shortcut**: multiple owners; multiple workflows per team; OKR layer (Objectives + Key Results); story types enum; checklists with owners; configurable point scales + native burndown/velocity.
- **Height**: real-time chat-per-task; tasks in many lists at once; multi-assignee; unlimited custom attributes on a flat global registry; autonomous AI chores (triage, dedupe, pruning, spec sync, standups).

---

## 6. Comparison matrix

| Mechanic | Jira | GitHub Issues + Projects | Shortcut | Height (†2025) | Linear (baseline) |
|---|---|---|---|---|---|
| Hierarchy | Epic→Story→Subtask; custom levels above (Premium) | Sub-issues: 8 levels, 100/parent; org issue types | Objective→Epic→Story→Task(checklist) | Infinite subtask nesting | Initiative→Project→Issue→Sub-issue |
| Custom issue types | Yes, schemes + hierarchy levels | Yes (org-level, flat, ~25) | Fixed enum (feature/bug/chore) | No (attributes instead) | No (labels/templates) |
| Custom statuses | Unlimited, 3 categories | Open/closed + close reason; Projects single-select | Per-team state lists, 3 categories | Custom status attribute | Per-team, 5 categories |
| Transition rules (validators/post-fns) | **Yes — full engine** | No | No | No | No |
| Sprint/iteration support | Full Scrum (goal, parallel, reports) | Iteration field (breaks, @current) | Iterations + burndown/velocity | Light (date attributes) | Cycles (auto-rolling) |
| Scope-change tracking | **Yes (burndown log, sprint report)** | No | Partial (iteration charts) | No | Partial (cycle graphs) |
| Velocity/burndown | Native | Build via Insights charts | Native | No | Cycle charts/Insights |
| Ranking algorithm | **LexoRank (global canonical)** | Per-view manual position | Per-context manual | Per-list manual | Fractional sortOrder |
| Multi-assignee | No (single) | Yes (10) | Yes (owners) | Yes | No |
| Estimation | Points or time-tracking | Number field (convention) | Configurable point scales | Estimate attribute | Per-team scales |
| Custom fields | **Yes (types, contexts, screens)** | Projects fields (5 types, 50 max) | Built-in optional + custom selects | **Yes (flat attribute registry)** | No |
| Issue templates/forms | Screens; JSM forms | **YAML issue forms w/ validation** | Story templates (admin) | Light | Per-team templates |
| Automation engine | **Trigger/condition/action DSL, smart values** | Built-in workflows + Actions | Minimal (VCS state moves) | AI-driven chores | Limited (auto-close/archive, triage) |
| Query language | **JQL (history-aware)** | Search qualifiers + view filters | Search operators | Filter-based smart lists | Filter API (no DSL) |
| Permissions granularity | **Schemes, roles, issue security** | Repo/org roles | Role tiers | Role tiers | Workspace/team roles + private teams |
| Watchers/notifications | Schemes + watchers + subscriptions | Subscriptions + inbox | Followers | Subscribers + chat | Subscribers + inbox |
| API create shape | REST `fields` map; transitions for status; createmeta | REST issues; GraphQL-only Projects, per-field updates | **One-call REST create incl. external_id** | Simple REST | GraphQL `issueCreate` |
| Webhooks | JQL-scoped, changelog payloads | Per-event incl. projects_v2 | Single stream of action diffs | Activities | Per-model, signed |
| VCS→status automation | Workflow triggers on dev events | **Closing keywords, native** | Branch-name (`sc-123`) mapping | Branch-name (`T-123`) | Magic words + branch names |
| Chat/collab model | Comments | Comments + reactions | Comments | **Real-time chat per task** | Comments + reactions |
| OKR/goal layer | No (JPD adjacent) | No | **Objectives + Key Results** | No | Initiatives (no KRs) |

---

## 7. Top 12 mechanics Beacon should consider (ranked)

Mapped to `lib/db/schema.ts` as it exists today.

1. **Fractional rank column on `work_items`** — one canonical `rank text` per item (LexoRank/fractional-index strings, background rebalance) rather than per-view order — one column, sidesteps a whole table of view-positions.
2. **Sprints as event-derived containers** — `sprints` (id, workspaceId, teamId?, name, goal, startAt, endAt, state) + `sprint_items` join; emit `sprint.item_added/removed`, `estimate.changed` into `events`; Jira-grade scope-change reports, burndown, and velocity fall out of the event stream — Beacon's unfair advantage.
3. **Custom statuses mapped to canonical categories** — keep `WORK_ITEM_STATUSES` as fixed *categories* and add per-workspace/team display states (`workflow_states`: name, category, position) — the Jira/Shortcut/Linear convergence: teams get vocabulary without breaking event-derived status or cross-team rollups.
4. **VCS closing keywords + branch keys** — parse `fixes BCN-42` in PR bodies/commits and `bcn-42` in branch names during GitHub ingest to auto-link and auto-transition; `work_items.key` and the GitHub pipeline already exist — highest-leverage/lowest-cost automation in the whole list.
5. **Watchers + auto-subscribe** — `work_item_watchers` (workItemId, memberId, reason: manual/assigned/commented) feeding an inbox derived from `events`; insights (`insights.workItemId`) route through the same channel.
6. **Automation rules on the event bus** — `automation_rules` (workspaceId, triggerEventType, condition jsonb, actions jsonb, enabled) evaluated in the ingest path; start with five actions (set status/assignee/priority/label, create event, notify); later the substrate for Height-style AI chores.
7. **Issue templates** — `work_item_templates` (workspaceId, teamId?, name, kind, defaults jsonb) with GitHub-forms-style required flags later; the single biggest quick-add UX win.
8. **Estimation field + per-workspace scale** — `estimate real` on work_items + a workspace scale setting; prerequisite for velocity (#2).
9. **Relations table (blocks / duplicates / relates)** — `work_item_relations` (fromId, toId, type); Beacon has a `blocked` status but no *reason* edge; the blocker-insight engine should cite an actual edge.
10. **Lightweight custom fields via a flat attribute registry (Height model)** — `field_definitions` (workspaceId, name, type, options jsonb) + `work_items.attributes jsonb`; skip Jira's contexts/screens bureaucracy; closes the #1 Linear gap that pushes teams to Jira.
11. **Chat-per-task as an event type (Height model)** — comments stored as `events` (`type: 'chat.message'`, `workItemId`, `payload.body`) rather than a separate comments table: real-time task threads, AI context, standup/digest generation all read one stream — uniquely aligned with Beacon's architecture.
12. **Saved views / smart lists** — `views` (workspaceId, name, filter jsonb, layout, groupBy, sortBy) treating boards as *views over work_items*, never containers (Jira boards, GitHub Projects views, Height smart lists all agree); pairs with #1 for board ordering.

Deliberately *not* recommended: transition validators/post-functions (Jira's admin tax; automation rules cover the sane cases), multi-assignee (keep single `assigneeMemberId` + watchers as collaborators; revisit on user pull), permission/notification schemes (Beacon's 3-role + team-lead model is a feature, not a gap), per-view ordering (doubles state for little gain).

## Sources

[Jira advanced workflows](https://support.atlassian.com/jira-cloud-administration/docs/configure-advanced-issue-workflows/) · [LexoRank explained](https://tmcalm.nl/blog/lexorank-jira-ranking-system-explained/) · [Sprint burndown](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-sprint-burndown-report/) · [Jira automation actions](https://support.atlassian.com/cloud-automation/docs/jira-automation-actions/) · [Smart values](https://support.atlassian.com/cloud-automation/docs/smart-values-in-jira-automation/) · [Jira Product Discovery](https://www.atlassian.com/software/jira/product-discovery/guides/getting-started/introduction) · [Jira REST v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/) · [Evolving GitHub Issues](https://github.blog/changelog/2025-01-12-evolving-github-issues-public-preview/) · [Sub-issues docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues) · [Issue types REST](https://github.blog/changelog/2025-03-18-github-issues-projects-rest-api-support-for-issue-types/) · [About Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects) · [Built-in automations](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations) · [Shortcut basics](https://help.shortcut.com/hc/en-us/articles/4410865465748-Get-Started-with-the-Basics) · [Story templates](https://help.shortcut.com/hc/en-us/articles/360016736311-Story-Templates-Overview) · [Shortcut REST v3](https://developer.shortcut.com/api/rest/v3) · [Shortcut webhooks](https://developer.shortcut.com/api/webhook/v1) · [Height shutdown](https://alternativeto.net/news/2025/3/height-project-management-tool-to-shut-down-by-september-2025/) · [Height Copilot](https://height.app/blog/heights-ai-powered-solution-copilot-is-here-to-streamline-the-way-you-work)
