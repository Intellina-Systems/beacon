# Work Management Platforms: Asana, ClickUp, Monday.com, Notion

> Research compiled 2026-07-17 from official docs and developer references by a Claude research agent. Part of the competitive research set in `docs/research/`. See `SYNTHESIS.md` for cross-product conclusions.

---

## 1. Asana (deep dive)

### 1.1 Object model

- **Workspace** — top-level container. An **Organization** is a special workspace bound to a shared email domain. Guests (external emails) get limited access to explicitly-shared content.
- **Team** — a subset of users; every project belongs to exactly one team. Privacy: public/private/request-to-join.
- **Project** — a collection of tasks in one team; list, board, timeline (Gantt), calendar views. Public or private.
- **Section** — a subdivision of tasks within a project (workflow stages, categories, priorities). Board columns in board view, headers in list view — the substrate for board workflow without hard-coded statuses.
- **Task** — "the basic unit of action." **Single assignee** (deliberate: one throat to choke), notes, followers/collaborators, comments ("stories"), attachments, likes.
- **Subtask** — a full task with a `parent` pointer; up to 5 nesting levels; a subtask can *also* be added to projects independently of its parent.
- **Portfolio** — aggregates projects (and nested portfolios) with custom fields at project granularity — an exec status roll-up.
- **Goal** — workspace/team/individual OKR object, separate from the project tree.
- **Custom fields** — global (org library, reusable/reportable across projects) or local (project-only). Types: text, number, enum, multi-enum, date, people, formula.

### 1.2 Multi-homing (the key differentiator)

A task can live in **multiple projects simultaneously** — *one* task object appearing in N containers. API models it as `memberships[]`: an array of `{project, section}` pairs, so a task has a *section position per project*. Updates sync everywhere because there's only one record. Canonical uses:

- Bug intake project + sprint project + team roadmap referencing the same task.
- Cross-functional work: design's project and engineering's project share the task; each keeps its own sections/workflow around it.
- "Tracking" projects: a project that's purely a lens ("All launches Q3") built by multi-homing tasks from many sources.
- Rules can auto-multi-home: "when form submitted with type=Bug, add to Engineering Bugs project."

The single most-cited architectural difference vs classic issue trackers.

### 1.3 Task anatomy (API view)

Task fields include: `assignee`, `assigned_by`, `completed/_at/_by`, `due_on` (date) vs `due_at` (datetime), `start_on/start_at` (start requires due), `dependencies[]`/`dependents[]`, `parent`, `followers[]`, `memberships[]`, `tags[]`, `custom_fields[]`, `approval_status`, **`assignee_section`** (which section of the *assignee's* My Tasks the task sits in — personal triage position as a first-class field), `actual_time_minutes`, `resource_subtype` (default_task | milestone | approval), `custom_type`. Key endpoints: `POST /tasks`, `PUT /tasks/{gid}`, `addProject`/`removeProject`, `setParent`, `addDependencies`/`addDependents`, `POST /sections/{gid}/addTask`.

### 1.4 Custom fields

- Org-wide **field library** so "Priority" means the same thing in every project (essential for cross-project reporting) vs local fields.
- Types: single-select enum (colors), multi-select, number (precision/format: %, currency), text, date, people, **formula** (computed).
- Fields attach to projects and portfolios (project-granularity fields).

### 1.5 Rules (automation)

**Trigger(s) → optional conditions → action(s)**; multiple triggers OR, actions run in order.
- **Triggers**: task added to project/section, moved to section, completed, assignee changed, due date set/changed, **due date approaching (X days before)**, **task overdue**, custom field changed, comment added, attachment added, form submitted, approval status changed, status posted.
- **Actions**: move to section, add/remove from project (rule-driven multi-homing), assign, set due date (relative), set custom field, comment, add collaborators, complete/incomplete, create subtasks (from template), create approval task, Slack/Teams message, webhook/app action, and (2025) run an **AI Studio step**.
- Rule executions logged in task activity + a project/portfolio rule log — an audit trail for automation (trust).
- Preset recipe gallery; custom builder gated to Starter+.

### 1.6 Forms (intake)

- Each project can host forms; **every submission becomes a task** with answers mapped to name/description/assignee/due date/custom fields.
- **Branching logic**: answers reveal/hide follow-up questions.
- Forms exposable to people *outside* Asana (anonymous link) — the external intake funnel.
- Combined with rules: route by answer ("Bug" → engineering section, assign triage owner, set priority). Forms → task → rules is Asana's canonical work-intake story.

### 1.7 Portfolios & status updates

- Portfolios list projects as rows with custom fields (owner, budget, phase) + timeline and workload roll-ups; portfolios nest.
- **Status updates** are first-class on projects, portfolios, and goals: **on track / at risk / off track / on hold** (+ complete/dropped), rich-text body with a "highlights" builder dragging in live data (milestones, accomplishments, blockers, stats). Updates notify members and are archived chronologically — the project's health history.
- **Scheduled reminders** prompt owners to post updates on a cadence — the ritual is productized.
- Smart Status (AI) drafts the update from recent activity.

### 1.8 Goals (OKRs)

- Goal: **owner, time period, team or company scope, parent goal** → goal trees: company mission → company goals → team goals → sub-goals (key results).
- **Progress sources**: manual %, roll-up from sub-goals (weighted), or **automatic from connected work** — link projects/portfolios/tasks and progress derives from completion. The goal page shows exactly which projects drive it and their health.
- Goals have their own status updates and closure states (achieved, missed, partial, dropped).

### 1.9 Workload / capacity

- **Workload** is a portfolio tab: y = people, x = time, cells = summed effort of assigned tasks in the window.
- **Effort** = task count by default, or a chosen **number custom field** (hours or points). Needs assignee + start/due + effort; effort spreads across the date range.
- Per-person **weekly capacity**; over-capacity renders red; drag-and-drop tasks between people/dates to rebalance.
- Fall 2025: AI-assisted allocation suggestions.

### 1.10 Dependencies, approvals, milestones, My Tasks

- **Dependencies**: blocked-by/blocking, visualized in timeline. **Auto-shifting dates**: when a predecessor moves, dependents shift with configurable strategy — **Lag** (preserve gap exactly), **Slack** (only shift if a conflict is created — don't move what doesn't need moving), or **None**; shifting **skips weekends**. Assignees of dependents notified when a blocker completes.
- **Approvals**: task subtype; **Approved / Changes requested / Rejected**. Any outcome marks the approval complete (documented gotcha — "changes requested" completing confuses dependency chains).
- **Milestones**: zero-duration date markers on timelines feeding progress charts.
- **My Tasks**: personal cross-project list of everything assigned, with private sections (**Recently assigned / Today / Upcoming / Later**). **Auto-promotion**: just after midnight local, due/starting-today → Today; due ≤1 week → Upcoming. Custom sections + **personal rules** (My Tasks has its own rule engine). `assignee_section` is private personal metadata that doesn't disturb project structure — clean separation of *personal triage* from *team organization*.

### 1.11 Asana Intelligence / AI Studio (2025–2026)

- **Smart summaries** (task/project/portfolio), **change summaries** ("what changed since you last looked").
- **Smart status** drafts updates, flags risks; Fall 2025 **AI risk reports** — weekly automated risk assessment.
- **Smart fields / projects / rules**: AI generates fields, structures, rule definitions from natural language.
- **AI Studio**: no-code builder for **AI steps embedded in rules/workflows** — on form submission, AI triages, renames, summarizes, sets fields, routes; "AI teammates" take defined workflow roles with human checkpoints.
- Differentiator claim: AI grounded in the **work graph** (tasks↔projects↔goals↔people), answers cite real work objects.

### 1.12 API shape & webhooks

- REST at `app.asana.com/api/1.0`; `gid`s; sparse fieldsets (`opt_fields`); cursor pagination; batch endpoint; OAuth2 + PATs.
- **Events API** (polling with sync tokens) and **Webhooks** on the same stream: **X-Hook-Secret handshake**, HMAC-SHA256 `X-Hook-Signature`, batched events, **at-most-once delivery** (docs tell you to keep a polling fallback), heartbeats every 8h, exponential backoff 24h then auto-delete, filters by resource type/action/fields. Events are `{resource, action: added|changed|deleted|removed|undeleted, parent, user, created_at}` — very close to Beacon's event taxonomy.

---

## 2. ClickUp

### 2.1 Hierarchy

**Workspace → Space → Folder (optional) → List → Task → Subtask (nested) → checklists.** Spaces map to departments/teams; Lists are the task containers. **Inheritance cascades down**: statuses, ClickApps, settings defined at Space level apply beneath unless overridden. Views (List, Board, Gantt, Calendar, Timeline, Table, Workload, Mind Map…) can be created **at any hierarchy level**; "Everything" view spans the workspace.

### 2.2 Custom statuses per container

Real status pipelines **definable per Space, Folder, or List**; each level can override its parent's set. Statuses have types (Open / Active / Done / Closed) so reporting normalizes heterogeneous pipelines. A task in multiple lists still has **one** status. The tension to study: flexibility vs reporting complexity — resolved via status *types* (same convergence as Linear/Jira/Shortcut).

### 2.3 ClickApps

A **feature-flag system**: ~40 optional modules toggled per-workspace or per-Space — Multiple Assignees, Sprints, Sprint Points, Time Tracking, Time Estimates, Custom Fields, Dependencies, Priorities, Tags, Milestones, WIP limits, Email-in, Automations… Complexity is opt-in: engineering runs Sprints + Points; marketing never sees them. Notable pattern for Beacon: gate features per team/workspace.

### 2.4 Tasks

- **Multiple assignees** (ClickApp) + watchers. Tasks **in multiple Lists** (ClickApp) — like Asana multi-homing with a home-list distinction; one status.
- Priorities (Urgent/High/Normal/Low), tags, dependencies (waiting-on/blocking + linked tasks), milestones, recurring tasks, task templates, checklists.
- Custom fields: ~15 types incl. formula, relationship (task-to-task with rollups), progress, rating, location.

### 2.5 Sprints

Sprints ClickApp creates a **Sprint Folder** with sprint Lists: dates, **sprint points** (rollups; subtask points can roll to parents), velocity, **burndown/burnup**, and automation to **carry unfinished tasks into the next sprint**. Sprint dashboards get dedicated widgets (velocity, burndown, burnup, cumulative flow).

### 2.6 Dashboards, time tracking, workload

- **Dashboards**: 50+ card types over any filtered scope; scheduled email reports.
- **Native time tracking**: timers or manual entries, estimates per task (and per-assignee split), actual vs estimate roll-ups, billable flags, timesheets.
- **Workload view**: capacity per person in **hours, points, or task count**; load vs capacity per day/week; overallocation flags; "Team view" shows what everyone's on.

### 2.7 Docs, whiteboards, chat

Docs (wiki-style, live in the hierarchy, text convertible to tasks), Whiteboards (shapes → tasks), native Chat (channels tied to Spaces/Lists, messages → tasks), Clips, Goals (targets: number/currency/boolean/task-completion rollups). The "everything app" consolidation bet — opposite of Beacon's focused-intelligence bet, but instructive on task links permeating every surface.

### 2.8 Automations

**Trigger → conditions → actions**, scoped to Space/Folder/List. Triggers: status changes, assignee changes, due date arrives/changes, priority/custom field changes, task created/moved, tag added, checklist resolved, time tracked, form submitted, task linked, GitHub events. Actions: change fields, move, create subtask, apply template, comment/tag/watcher, email/Slack/webhook, external apps. Audit log + quotas. "AI Automations": natural language generates the rule; AI can be an action (summarize, update fields).

### 2.9 ClickUp Brain / Brain² (AI)

- **Brain** pillars: **AI Knowledge Manager** (Q&A over tasks/docs/chat), **AI Project Manager** (auto progress updates, standups, task summaries, subtask generation), **AI Writer**.
- 2025–2026: **Autopilot Agents** — no-code agents scoped to locations with triggers + instructions + tools; prebuilt (auto-answer, weekly report, triage) and custom. **Super Agents** appear as assignable users you can @mention and give work to. **Brain²**: persistent memory, multi-model routing, Brain MAX desktop (voice, enterprise search), AI Notetaker.

### 2.10 API

REST v2 (`api.clickup.com/api/v2`), personal tokens or OAuth2. Resources mirror the hierarchy: `/team`, `/space`, `/folder`, `/list`, `/list/{id}/task`. Tasks CRUD with assignees (array), status (string matching the list's pipeline), priority, due dates, estimates, custom fields, dependencies, tags; time tracking; goals; views. **Webhooks** per workspace: event list (`taskCreated`, `taskUpdated`, `taskStatusUpdated`, `taskAssigneeUpdated`, `taskCommentPosted`, list/folder/space/goal events), optional scoping, HMAC-signed, health monitoring with auto-suspend. ~100 req/min.

---

## 3. Monday.com

### 3.1 Data model: boards / groups / items / subitems / columns

- **Workspace → Boards**. A **board** is a supercharged spreadsheet: **Groups** (colored row-sections: "Sprint 12", workflow stages), **Items** (rows, up to 10k/board), **Subitems** (child rows with their **own independent column schema**), **Columns** (typed fields, board-wide).
- Board types: Main, Private, Shareable. No fixed semantics — a board can be a project, sprint, CRM pipeline. Monday is a **generic relational-table engine with work-management skins** (monday work management / dev / CRM / service are bundles over the same engine).

### 3.2 Column types (the system's core)

30+ types: **Status** (a board can have *several* status columns, e.g. "Design status" + "Dev status"), **People** (multiple assignees or teams), Date, **Timeline** (start–end), Numbers, Text, Dropdown, Checkbox, Rating, **Formula**, Tags, Files, **Connect Boards** (relation to items on other boards) + **Mirror** (display/aggregate a connected item's values — relations+rollups), Dependency, Progress, Time-tracking, Auto-number, Item ID, Creation-log, and (2025) **AI columns**. Column system = why monday feels "no-code database": semantics come entirely from which columns you add.

### 3.3 Automations: recipe sentences

- Signature UX: fill-in-the-blank **sentences** — "**When** status changes **to** Done, **then** notify X"; "**Every** Monday at 9am, create item"; "When date arrives and status is not Done, notify manager."
- Blocks: **When** (column/board event, date arrives, button clicked, form submitted, recurring **Every**) + conditions (AND-only; OR = multiple recipes) + one or more actions (notify, assign, set column, create item/subitem, move, duplicate, connect, create update, start time tracking, webhook, email).
- Huge **pre-built recipe library** by category + custom builder + marketplace apps adding third-party recipes (the sentence grammar is an open extension point).
- Usage metered per plan (actions/month) — automation as a billable resource.
- **Button column** = manual trigger — human-in-the-loop automation.

### 3.4 Views & dashboards

Board views: Table, Kanban, Gantt/Timeline, Calendar, Chart, Cards, Map, Form, **Workload**. **Dashboards** aggregate up to 30 boards with widgets (numbers, charts, battery, timeline, time tracking, workload).

### 3.5 Workload

Rows = people (from a People column), columns = time (from Date/Timeline); **effort** = item count, a Number column, or Time-estimation; **capacity** = "Work schedule" (user working-hours profile, respects days off) or custom units (e.g., 40 pts/week). Circles size/color by load vs capacity; click a day to reassign. **Multi-assignee effort split**: "Split" (divide evenly) or "Sum" (full effort per person) — a subtle correctness knob for multi-assignee work.

### 3.6 monday dev

Engineering product on the board engine: **sprint boards**, sprint points, **auto-generated burndown & velocity**, retrospectives board, **carry-over automation**, backlog board, **roadmap/epics boards via Connect Boards** (task→epic rollups), bug templates, **GitHub/GitLab integration** (PR/commit/branch events update item status; performance dashboards correlate tickets with PR state), incident management, AI sprint summaries / standups. Demonstrates verticalizing a generic platform into dev workflows.

### 3.7 GraphQL API & webhooks

- **GraphQL-only** (`api.monday.com/v2`): `boards`, `groups`, `items`, `subitems`, `column_values` (typed JSON per column), `users`, `teams`, `workspaces`, `updates`, `docs`. Column values written as JSON keyed by column id. Cursor pagination.
- **Complexity-budget rate limiting**: each query costs points against a per-minute budget instead of request counts.
- **Webhooks**: per-board subscriptions with URL-verification challenge; events: item created/column changed/status changed/moved/deleted, subitem events, update created. Apps add custom triggers/actions into the recipe system.

### 3.8 Updates & notifications

Every item has an **Updates** section — a threaded conversation feed on the item (email-in supported), keeping discussion attached to the work. Bell notifications + **My Work** (cross-board personal view of assigned items grouped by date). Notification recipes let teams design their own alerting ("notify manager when Blocked").

### 3.9 monday AI (2025–2026)

**AI Blocks** (modular actions — Categorize, Extract, Summarize, Sentiment, Translate — inside automations and as AI columns), **Product Power-ups** (AI risk detection for portfolios, AI sprint summaries/standups, formula-writing, board building), **Digital Workforce** agents ("monday magic" builds workspaces from a prompt; "monday sidekick" assistant; vertical agents).

---

## 4. Notion

### 4.1 Databases as task systems

No native "task" primitive — **everything is a page; databases are collections of pages with a property schema**. A task tracker = a database whose pages carry Status/Assignee/Due properties. Consequences: every task is a full document; schema fully user-defined; no enforced semantics. Templates supply the semantics — the official **Projects & Tasks & Sprints** templates have property configurations that unlock built-in behaviors.

### 4.2 Properties, relations, rollups

- Types: Title, Text, Number, **Select/Multi-select**, **Status** (special grouped type: To-do / In Progress / Complete groups containing custom options — Notion's status-category normalization), Date (range), **People**, Files, Checkbox, URL, **Formula**, **Relation** (bidirectional links between databases), **Rollup** (aggregate across related pages: count, % complete, sum…), Created/Edited time & by, **ID (auto-increment — "ENG-123"-style keys)**, Button, **AI properties** (autofill: summary, keywords, translation, custom prompts per row).
- **Relations + rollups are the modeling core**: Tasks ⇄ Projects; Project rollup shows % complete; Sprint ⇄ Tasks; Tasks ⇄ Tasks self-relation gives parent/sub-item and blocking/blocked-by (dependency arrows in timeline).

### 4.3 Views

One database, many views: **Table, Board, Timeline, Calendar, List, Gallery, Chart**, each with own filters/sorts/grouping; **linked databases** embed a filtered view anywhere ("my tasks due this week" inline on any page) — Notion's multi-home: the *view* travels, not the task.

### 4.4 Sprints template mechanics

Three wired databases: **Tasks**, **Sprints**, (optionally Projects/Epics):
- Sprints have status **Current / Next / Last** + date range; tasks relate to a sprint.
- Board filtered to "Current sprint" is the working board; backlog view shows sprint-less tasks.
- **Sprint completion flow**: completing a sprint opens a dialog — dates for the next sprint and what to do with incomplete tasks: **move to next / move to backlog / keep**. Statuses flip, next sprint auto-created.
- **Automated sprints**: roll automatically on schedule (1–4 weeks) with default carry-over — sprint cadence with zero ceremony.
- **Database automations**: trigger on page added/property edited → edit properties, add page to another database, Slack/notification, webhook.
- GitHub integration auto-updates task status from linked PRs (merged → Done).

### 4.5 Notion AI (2025–2026)

- **Q&A / Enterprise Search**: chat over the workspace *and* connected tools via **AI Connectors** (Slack, Drive, Gmail, GitHub, Linear, Jira) — answers cite sources across systems. The closest commercial analog to Beacon's AI-chat-over-work-graph ambition.
- **AI Meeting Notes** (transcription, summaries, action items), **AI database autofill**, AI formula writing, AI page/DB generation.
- **Notion 3.0 (late 2025): Agents** — multi-step work (create/edit pages and databases, research across connected sources, run on schedules); **Custom Agents** automate recurring team work. AI bundled into Business/Enterprise plans.

### 4.6 API

REST (`api.notion.com`), token per integration with page/database-level grants. Model (2025): **Database → data sources → pages**; query endpoint with compound AND/OR filters + sorts; cursor pagination; typed property payloads; block API for content; comments API; webhooks (2025) for page/database events. Schema guidance: ≤500 properties. Schema-agnostic — a task tracker is just a database.

---

## 5. Cross-cutting themes

### (a) Capacity/workload views
All four converge: **for each person × time bucket, sum effort of assigned items whose date range overlaps; compare to per-person capacity; color the overflow.** Effort source: number field (Asana), estimates/points (ClickUp), Number/Time column (monday), rollups (Notion). Capacity source: flat weekly number (Asana), hours/points/count (ClickUp), **work-schedule profiles with days off** (monday — most sophisticated). Solved edge cases: effort spread across start→due range; multi-assignee split vs sum; missing-data handling; drag-to-rebalance in the view.

### (b) Goals/OKR trees
Asana deepest: goal trees, owners + time periods, **progress auto-derived from linked projects/portfolios/tasks**, goal-level status updates. ClickUp: Targets (numeric/boolean/task rollups). Monday: templates + Connect/Mirror. Notion: related DBs with rollup %. The differentiating mechanic: **strategy objects with progress computed from execution objects** — both directions of visibility.

### (c) Automation rule engines
Common shape: **event trigger → optional conditions → ordered actions**, scoped to a container, with execution logs and per-plan quotas. Trigger taxonomy (union): item created/moved/status changed/assignee changed/date set-changed/**date arrives-approaching-overdue** (scheduler-based!)/field changed/comment/attachment/form submitted/approval decided/checklist done/time tracked/**recurring schedule**/**manual button**/external (GitHub, email-in, webhook). Actions: mutate fields, move/multi-home, create from templates, notify, spawn approvals, webhooks, **AI steps**. Notable: monday's sentence UX; Asana's audit trail; ClickUp's hierarchy scoping; time-based triggers requiring a scheduler alongside the event bus.

### (d) Status update rituals
Asana productized end-to-end: status object (on-track/at-risk/off-track/on-hold) on projects/portfolios/goals, rich text with data highlights, **scheduled owner reminders**, member notifications, archived history, AI-drafted updates + weekly AI risk reports. The insight: separate **derived status** (rollups, burndowns — automatic) from **narrated health** (a human/AI judgment: on track or not, why, what's needed) and schedule the latter.

### (e) Forms/intake funnels
Asana Forms (branching, field mapping, public links, rules routing), monday WorkForms (a form is a board view; submissions = items), ClickUp Forms, Notion Forms. Universal pattern: **external unauthenticated intake → structured record with mapped fields → automation routes/assigns/prioritizes.** How non-members inject work without seats.

### (f) Multi-home
Asana: true multi-home via `memberships[]` (one task, per-project section placement) — gold standard. ClickUp: tasks-in-multiple-lists (single status). Monday: Connect Boards + Mirror simulate it (linked reflection, not shared identity). Notion: single source row + **linked views everywhere** (the view multi-homes). Three architectures: shared identity / mirrored reference / projected view. Shared identity gives the best consistency; per-container *placement* metadata is the detail that makes it usable.

### (g) Notification/inbox design
- **Asana Inbox**: canonical — notifications generated by *followership*, grouped by thread, archive/bookmark/snooze, filters; My Tasks handles assignments while Inbox handles awareness; deliberate anti-noise controls.
- **ClickUp Inbox 3.0**: Important (mentions/assignments) vs Other; clear/snooze/remind-me.
- **monday**: bell + item Updates threads + My Work.
- **Notion**: Inbox for mentions/edits/comments; Home surfaces assigned tasks.
- Shared principles: split *assigned to me* (worklist) from *things I follow* (feed); actionable in place; automation can write to notifications; snooze/archive for inbox-zero.

### (h) AI layering 2025–2026 (convergent roadmap)
The same ladder everywhere: (1) **generative assist** → (2) **Q&A over the work graph** → (3) **AI inside automations** → (4) **autonomous agents with identity** → (5) **proactive risk/health intelligence**. Common design choices: agents scoped to containers, human checkpoints, grounding in the product's own object graph. Beacon's event stream is precisely the substrate step (5) needs — the platforms retrofit activity feeds for this; Beacon has it natively.

---

## Top 10 mechanics Beacon should consider (ranked)

1. **Asana-style multi-homing via a memberships join table** — `work_item_memberships (work_item_id, project_id, position/section)`; one item visible in a team's project, a sprint, and a cross-org initiative simultaneously, with per-container placement; every membership change is naturally an event. The single highest-leverage structural change.
2. **Workload view derived from work_items + estimates** — add `estimate`; capacity per member; the view is a pure query over assignee × date-range × estimate vs capacity; Beacon's event stream can additionally show *historical* load (which no competitor derives from an audit log).
3. **Monday-style automation recipes folded into Beacon's event taxonomy** — events are already the trigger source; a `rules (trigger_event_type, conditions_jsonb, actions_jsonb)` table + a consumer on the stream gives "when status→blocked, notify team lead" almost for free; add a scheduler for date-arrives/overdue/recurring; log executions back into the stream.
4. **Status update rituals: project health as a first-class object** — `status_updates (project_id, health, body, author, posted_at)` with scheduled owner reminders and AI-drafted bodies from the event stream.
5. **Goals/OKR tree linked to execution** — `goals (workspace_id, parent_goal_id, owner, period)` + `goal_links (goal_id, project_id | work_item_id)`; progress derives from done/total of linked work — the same fold Beacon already does for status, one level up.
6. **My Tasks with auto-promotion + private triage sections** — per-member cross-project view of assigned items with personal buckets stored as personal metadata (Asana's `assignee_section`), auto-promoted by due date via daily job.
7. **Dependencies with auto-shifting dates** — `work_item_dependencies (blocker_id, blocked_id)`; `blocked` status could then be *derived* (blocked = has incomplete blockers); optional lag/slack date-shifting on due-date-change events, skipping weekends.
8. **Forms intake funnel** — public form per project mapping answers → work_item fields; non-members file work without seats; submissions enter as backlog events and rules route them.
9. **Notification inbox generated from the event stream with followership** — `work_item_followers` + an inbox materialized from events filtered to followed items, split "assigned to me" vs "following", archive/snooze; a projection, not new infrastructure.
10. **ClickApp-style per-workspace/team feature toggles** — a `workspace_features`/`team_features` flags table gating sprints, workload, goals, forms per tenant; ship advanced mechanics without imposing complexity on small teams.

Honorable mentions: approval-subtype work items (with the "rejection ≠ complete" lesson), Notion-style AI autofill on work_item fields, monday's multi-assignee effort split/sum toggle, sprint auto-rollover as an automated event batch.

## Sources

[Asana object hierarchy](https://developers.asana.com/docs/object-hierarchy) · [Asana Tasks API](https://developers.asana.com/reference/tasks) · [Asana webhooks](https://developers.asana.com/docs/webhooks-guide) · [Multi-homing](https://help.asana.com/s/article/how-to-multi-home-tasks?language=en_US) · [Capacity planning](https://help.asana.com/s/article/capacity-planning?language=en_US) · [Rule triggers](https://help.asana.com/s/article/rule-triggers?language=en_US) · [Auto-shifting dates](https://help.asana.com/s/article/auto-shifting-dates-for-dependent-tasks?language=en_US) · [Forms branching](https://help.asana.com/s/article/how-to-use-forms-branching?language=en_US) · [Approvals](https://help.asana.com/s/article/approvals?language=en_US) · [Goals & connected work](https://help.asana.com/s/article/progress-status-and-connecting-work-to-goals?language=en_US) · [Project status updates](https://help.asana.com/s/article/project-progress-and-status-updates?language=en_US) · [Asana AI](https://help.asana.com/s/article/get-started-with-asana-ai?language=en_US) · [Fall 2025 release](https://asana.com/inside-asana/fall-release-2025) · [ClickUp Hierarchy](https://help.clickup.com/hc/en-us/articles/13856392825367-Intro-to-the-Hierarchy) · [ClickApps](https://help.clickup.com/hc/en-us/articles/6304327753111-Intro-to-ClickApps) · [Task statuses](https://help.clickup.com/hc/en-us/articles/6309452618647-Manage-task-statuses) · [Sprints](https://help.clickup.com/hc/en-us/articles/6303974210071-Intro-to-Sprints) · [Automation triggers](https://help.clickup.com/hc/en-us/articles/6312128853015-Use-Automation-Triggers) · [ClickUp Brain](https://help.clickup.com/hc/en-us/articles/12578085238039-What-is-ClickUp-Brain-AI) · [ClickUp webhooks](https://developer.clickup.com/docs/webhooks) · [monday board basics](https://support.monday.com/hc/en-us/articles/115005317249-The-basics-of-a-board) · [subitems](https://support.monday.com/hc/en-us/articles/360011905480-All-about-subitems) · [custom automations](https://support.monday.com/hc/en-us/articles/360012254440-Build-your-own-custom-automation) · [Workload widget](https://support.monday.com/hc/en-us/articles/360010699760-The-Workload-Widget) · [monday dev sprints](https://support.monday.com/hc/en-us/articles/360010646539-Sprint-management-with-monday-dev) · [monday API](https://developer.monday.com/api-reference/docs/basics) · [monday AI](https://monday.com/blog/product/monday-ai-ecosystem/) · [Notion relations & rollups](https://www.notion.com/help/relations-and-rollups) · [Notion sprints](https://www.notion.com/help/sprints) · [Notion AI](https://www.notion.com/product/ai) · [Notion API databases](https://developers.notion.com/docs/working-with-databases)
