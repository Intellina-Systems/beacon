# Linear: Complete Product & Platform Inventory (for Beacon)

> Research compiled 2026-07-17 from linear.app/docs, /developers, /method, /changelog by a Claude research agent. Part of the competitive research set in `docs/research/`. See `SYNTHESIS.md` for the cross-product conclusions.

---

## 1. Core Data Model

### 1.1 Conceptual hierarchy
Linear's official summary: **"issues track individual pieces of work; teams own the workflows those issues move through; cycles help teams plan short-term work; projects organize related issues around a deliverable; initiatives organize related projects around a broader goal; views help people navigate all of the above."**

- **Workspace** — top-level container for a company. Users can belong to multiple workspaces and switch between them.
- **Team** — the primary organizational unit. A default team (named after the workspace) is auto-created with the workspace. Team limits by plan: Free 2, Basic 5, Business/Enterprise unlimited. Teams can be hierarchical (sub-teams, up to **5 levels** on Enterprise).
- **Issue** — the fundamental unit of work. Belongs to exactly **one team**. ID = `{TEAM_KEY}-{number}` (e.g. ENG-123), sequential per team. Required fields: **title + status** only; everything else optional.
- **Project** — groups issues around a shared outcome; can span **multiple teams**, but an issue belongs to at most **one project**.
- **Initiative** — workspace-level grouping of projects around strategic goals; supports sub-initiatives.
- **Cycle** — team-owned repeating time-box (sprint analog).
- **View** — saved filter/display configuration; "different ways of looking at the same underlying work," never modifying data.

### 1.2 Workflow states (per-team)
Six **fixed-order state categories** (the key design insight — statuses are team-custom but every status has a machine-readable *type*):

1. **Triage** (optional, special) 2. **Backlog** 3. **Unstarted** (e.g. Todo) 4. **Started** (e.g. In Progress, In Review) 5. **Completed** (Done) 6. **Canceled** — plus a system-managed **Duplicate** status (reserved; issues marked duplicate move there automatically).

Rules: teams add/rename/recolor/describe statuses freely; reorder only *within* a category; **at least one status per category** must remain; default status for new issues = first Backlog status (configurable to any Backlog/Todo status via "Make default"; Triage intercepts if enabled). Default flow: Backlog → Todo → In Progress → Done / Canceled.

*Implied schema:* `workflow_states(id, team_id, name, color, description, type ENUM(triage|backlog|unstarted|started|completed|canceled|duplicate), position, is_default)`. All automation and cross-team reporting keys off `type`, not name — this is what makes per-team customization safe.

### 1.3 Issues & sub-issues
Fields: title, description (Markdown), status, priority, assignee, **delegate** (AI agent), estimate, labels, due date, SLA, cycle, project, project milestone, parent issue, relations, links/attachments, customer requests, template provenance, creator, subscribers.

**Sub-issues** (parent/child, effectively used one level though children can nest):
- Created via `Cmd/Ctrl+Shift+O`, from comments, from highlighted list items, from templates, or batch-paste of titles ("Create multiple issues").
- **Inheritance on creation**: team, priority, project, cycle (if created while parent in active status). Labels are NOT inherited. Assignee inherited only if you're assigned the parent or all existing sub-issues share the parent's assignee.
- **Sub-issues may live on a different team/assignee than the parent** (cross-team decomposition).
- **Status automations** (per-team toggles): parent auto-closes when all sub-issues done; sub-issues auto-close when parent closed. Git automations respect these.
- Conversions: issue→sub-issue (set parent), sub-issue→issue (remove parent), parent→**project** (children become standalone issues in the new project). Duplicate parent optionally includes sub-issues.

### 1.4 Relations
Four kinds: **Blocked by / Blocks** (directional pair), **Related**, **Duplicate of** (directional), plus AI-surfaced "Similar".
- Shortcuts `M+B` / `M+X` / `M+R`; referencing an issue ID in a description/comment **auto-creates a Related relation**.
- Blocked issues show orange flag; blocking show red. **When the blocker is resolved, the relation automatically demotes to Related.**
- Marking duplicate: merges — customer requests + attachments move to the canonical issue, dupe goes to the reserved Duplicate status with a banner linking to the original. Canonical can't be marked dup of its dupes.

*Implied schema:* `issue_relations(id, issue_id, related_issue_id, type ENUM(blocks|duplicate|related|similar))` — one row, direction encoded by which side is `issue_id`.

### 1.5 Labels
- Two scopes: **workspace labels** (all teams) and **team labels**; sub-teams use parent + workspace labels (edit only at parent level).
- **Label groups**: one level of nesting, ≤250 labels/group, create via `Group/Label` syntax, and — critical rule — **only one label from a group may be applied to an issue** (mutually exclusive enum-like behavior, e.g. `Type/Bug` vs `Type/Feature`).
- Labels have color + description (description feeds Triage Intelligence suggestions). **Archive** (keeps historical applications, blocks new use) vs **delete** (strips everywhere, irreversible). Same-named team labels act like one label in cross-team filtering (UI only, not API). Reserved names: assignee, cycle, effort, estimate, hours, priority, project, state, status.

### 1.6 Priorities & estimates
- **Priority**: fixed 5 values — No priority, Urgent, High, Medium, Low (Linear deliberately refuses custom priorities). Shortcut `P`. **Urgent triggers an immediate notification (and urgent email) to the assignee.** In priority-ordered views, drag-and-drop stores a **global manual sub-rank** within the same priority across the workspace.
- **Estimates** (per-team opt-in): scales Exponential (1,2,4,8,16 +32,64), Fibonacci (1,2,3,5,8 +13,21), Linear (1–5 +6,7), T-shirt (XS–XL +XXL,XXXL; stored as Fibonacci numbers). Optional explicit **0**, distinct from unestimated. **Unestimated issues count as 1 point by default** (configurable) in all cycle/project math — the trick that makes progress stats work without mandatory estimation.

### 1.7 Templates
- **Issue templates** (standard + **form templates** with fields: text, long text, dropdown, checkbox, date, instructions, plus property fields), **project templates**, **document templates**.
- Scope: workspace (can't preset team-specific props) or team (full access; visible to sub-teams).
- Templates pre-fill: team, status, priority, assignee, **delegated agent**, project, labels, estimate, **sub-issues**.
- Teams set **default templates**, separately for team members vs non-members; form templates only usable as defaults for non-members. Default templates can override the Triage status. Issues are **filterable by originating template** for intake analytics.

### 1.8 Other entities
- **Recurring issues**: per-team; next instance generated after due date passes at 00:01 team-timezone.
- **Drafts**: temporary (local-only autosave) vs saved (synced, 6-month retention).
- **Customers + Customer Requests** (Business+): customer entity (domain, name, logo, revenue, tier, size, status) → requests attach to issues/projects with "important" flag; filter/sort roadmap by customer count/revenue. Synced from Intercom (realtime), Zendesk/Front (12h), Salesforce (Enterprise), Slack, Asks, API.
- **Documents**: workspace/project/team docs; team documents page (Jun 2026).
- **Releases** (Apr 2026): version tracking, deployment automation, generated release notes; release-pipeline changelogs (Jun 2026).

---

## 2. Issue Lifecycle Features

### 2.1 Creation surfaces
`C` (modal) / `V` (full-screen) / `Alt+C` (from template) / linear.new / URL parameters (every property pre-settable via query string) / email-to-team-address (25 MB attachments, 250k char body, original email linked; template applies properties, email supplies title/body) / Slack / API / integrations. Properties changed **within 3 minutes of creation aren't logged** as activity (anti-noise rule).

### 2.2 Triage (the inbox for a team's incoming work)
- Entry: issues from integrations (Slack, Sentry, support tools, Asks), issues created by non-team members, issues created while in Triage view.
- Four actions: **Accept** (`1` → default status), **Mark duplicate** (`2` → merge attachments/requests into canonical, cancel), **Decline** (`3` → Canceled), **Snooze** (`H` — hidden until time passes *or new activity arrives*).
- **Triage responsibility**: designated members; rotation automatable via PagerDuty/Opsgenie/Rootly/incident.io or API.
- **Triage rules** (Business+): ordered condition→action rules (set team/status/assignee/label/project/priority), evaluated top-to-bottom, **chain across teams** (re-routed issue runs the destination team's rules).
- Option: require priority set before an issue can leave Triage.
- **Triage Intelligence / Product Intelligence** (AI): compares every new issue against existing ones; suggests assignee (based on who fixed similar issues), labels, project, priority; surfaces likely **duplicates/related**; **auto-apply rules** (Sep 2025) accept suggestions automatically, per-property or per-value.

### 2.3 Assignment & delegation
Single **assignee** (human owner). Separate **delegate** field for AI agents: delegating to an agent keeps the human as assignee — agents act, humans own. Agents are @mentionable and behave like members (non-billable).

### 2.4 Due dates & SLAs
- Due date: `Shift+D`; icon color-codes red (due/overdue), orange (≤1 week), gray. Optional notifications when near/past due. Filters: overdue, 1 day, 1 week, 3 months, custom, none. Sorting puts dated issues on top.
- **SLAs** (Business+): rules in workspace settings, evaluated on issue create/update; conditions on team/status/assignee/creator/priority/labels/project/project-status/initiative; targets preset (12h/24h/48h/1w/2w/4w) or custom incl. **business days** (Mon–Fri default, Sun–Thu option). **First matching rule wins.** Default rules: Urgent→24h, High→1 week, else remove. Six statuses: Low/Medium/High risk, Breached, Achieved, Failed; fire icon gray→yellow→orange→red. Subscribers notified 24h before breach and at breach. **Due date and SLA are mutually exclusive — applying an SLA clears the due date.** Rules don't retro-apply to existing issues unless the issue changes to match.

### 2.5 Notifications, Inbox, subscriptions
- Auto-subscribe on create/assign/mention; unsubscribe `Shift+S`. Subscribers get key-event notifications.
- **Inbox**: `G I`; j/k navigation; read toggle `U`, mark-all `Alt+U`; delete `Backspace`, delete-all-read `Shift+Backspace`; **snooze** (`H`) hides until a time; separate **reminders** ("Remind me" with natural-language times like "next quarter") that surface at top of issue; searchable/filterable by type/team/project/priority; cap 2,000 open notifications. Personal notifications mirrored to Slack DM/email/mobile push per user settings.

### 2.6 Comments & activity
- Threaded replies; threads **resolvable** (with optional AI summaries of resolved threads on Business+); emoji reactions (full Unicode + custom uploads) on issues, comments, project updates, initiative updates; `@user` mentions; `@Linear` invokes the agent in-context ("draft a status update", "summarize"); inline comments on description text/images (Jun 2026); attachments (`Cmd/Ctrl+Shift+A`); comment → convert to issue/sub-issue; edit own comments.
- **Activity log** per issue records property changes (except first-3-minutes grace) — Beacon's append-only events table is the same concept.

---

## 3. Teams

- **Settings**: name, identifier (issue-ID prefix), timezone (drives cycle/recurring timing), estimates config, intake email, "detailed issue history", members, labels, templates, recurring issues, Slack notifications, statuses & automations, Triage, Cycles. Option to copy an existing team's settings at creation. Team creation restrictable to admins.
- **Membership**: any member can view & self-join public teams; non-members can view public team issues and *be assigned* work; visited non-member teams show under "Exploring". Private teams (Business+): invite-only, invisible to non-members, URLs never unfurl in Slack.
- **Sub-teams**: members must belong to parent (guests exempt); **cycles inherit from parent schedule mandatorily** (if parent has one); statuses and estimates optionally inherited; labels/templates/views accessible from parent + workspace scopes; timezone, recurring issues, git automations, Slack channels independent. Un-nesting converts actively-used inherited entities into independent copies. **Private sub-teams** (Jun 2026): "restricted" (parent members can see/join) or fully private.
- **Lifecycle**: Team Home page; **retire** (read-only preservation: settings locked, issues view-only, removed from sidebar — for history/reporting) vs **delete** (30-day grace restore). Pre-deletion advice: export CSV or move issues.
- **Team Owner role** (Business+): delegated team governance — delete team, make private, change hierarchy, promote owners, configure who may manage labels/templates/settings/members. Workspace admins are implicit team owners. Not inherited parent→sub-team.

---

## 4. Cycles (Sprints)

- Per-team opt-in; **1–8 week** duration; start at 12:01 AM on chosen weekday in team timezone; repeat automatically forever (no manual sprint creation — the killer feature). Up to **15 upcoming cycles** pre-created for forward planning.
- **Cooldown**: optional between-cycle break for tech debt/planning; **issues cannot be assigned to a cooldown**.
- **Rollover**: at cycle end, unfinished issues automatically move to the next cycle — except issues moved to backlog/triage, canceled, or completed-during-cooldown.
- **Auto-add active issues**: any issue reaching started/completed without a cycle joins the current cycle (during cooldown: completed→attributed to previous cycle; started→not auto-assigned). Keeps cycle data honest without process discipline.
- **"Start cycle today"** ends current cycle immediately, rolls issues forward. Future cycle dates editable; past cycles immutable — analytics stored as **snapshots at completion** (issue lists may later diverge from historical graphs; that's accepted).
- **Capacity**: predicted from velocity of the **3 most recently completed cycles** (points or count); new teams get a rough estimate from member count.
- Cycle views show burn-up/progress graphs; calendar subscription (Google/ICS). Sub-teams share the parent's schedule so cross-team cycle numbers align.

*Implied schema:* `cycles(id, team_id, number, starts_at, ends_at, cooldown_ends_at)` + `issues.cycle_id` + nightly/event-driven snapshot rows for burnup (`cycle_history(cycle_id, date, scope_points, started_points, completed_points)`).

---

## 5. Projects, Milestones, Initiatives, Roadmap

### 5.1 Projects
- Properties: name (required), **lead** (single), members (opt-in for notifications), icon, team(s), status, **priority** (added 2024), start date, **target date** — dates support granular precision: exact day, month, quarter, half, year. Content: description doc, documents, links/attachments, milestones, custom-view tabs.
- **Project statuses** are workspace-configurable within categories (Backlog/Planned/In Progress/Completed/Canceled + custom e.g. "Maintenance").
- Multi-team projects show per-team tabs. Deletion recoverable 30 days.
- **Progress & graph**: generated once project starts; updates hourly, points every 7 days. Three series: **scope** (gray — scope-creep detection), **started**, **completed** (blue); red vertical target-date line. Progress = estimate points (unestimated = 1 pt). **Projected completion**: weekly velocity, recent weeks weighted, remaining = incomplete + in-progress at **¼ credit**, shown as optimistic/pessimistic dotted band (±~40%); needs ≥1 week of data. Milestone progress similarly counts started (partial) + completed.

### 5.2 Milestones
Ordered subdivisions within a project; optional target dates; drag to reorder/reschedule (multi-select drag on timeline); progress % per milestone; issue assignment via `Shift+M` or drag; suggested automatically for new issues in milestone-having projects; groupable/filterable; convert milestone → standalone project; current milestone shown on initiative timelines.

### 5.3 Project updates & health
- Structured posts: **health indicator (On track / At risk / Off track) + rich text**; posted by lead/owner first, then any member; comments + emoji reactions; **bidirectional Slack thread sync**; edits sync.
- **Reminder engine**: admin sets cadence (daily/weekly/biweekly + day/time); reminders only to leads/owners of In-Progress projects; nudges at +1 and +2 working days; per-project override (default / custom / off).
- **Staleness UX**: dashed outline (slightly overdue) → grey icon (long inactive) → "Update Missing" label (last update On Track + overdue by one cycle + 3 days). Filterable by last-update date.
- Updates **auto-append a generated progress report**: delays, target-date changes, lead changes, milestone progress (suppressed if <2% change). **"Write with Agent"** (Jun 2026) drafts the update from recent activity.

### 5.4 Initiatives
- Workspace-level; enabled in settings; visible to all members (**never guests**); no private initiatives (private-team projects inside remain hidden to non-members but the initiative itself is public).
- Properties (expanded Jul 2026): status (**Proposed/Planned/Active/Completed/Canceled**), priority, labels (workspace-managed), owner, target date, description, resources, projects list, latest update + health. Sub-initiatives supported; "Active Projects" column aggregates project health colors (green/yellow/red/gray) incl. sub-initiatives. Initiative graphs overlay per-project completion curves. Initiative Views = Enterprise.

### 5.5 Project dependencies
Timeline-visualized **end→start** blocking between projects: created from context menu or by dragging between bars; "Blocked by"/"Blocking" fields on the project; blue line = satisfied, **red = violated** (dates conflict); line anchors to blocking project's target/predicted end; dragging a project **bumps** downstream backlog/planned projects in the chain.

---

## 6. Views, UX & the Linear Method

- **Custom views**: types Issue / Project / Initiative (Enterprise); scope workspace / team / multi-team; built from scratch or by saving live filters (`Alt+V`); owner (reassignable); duplicate; layouts list + board (+ timeline for projects); grouping (incl. drag-reorder of groups, collapse with `t`), ordering (priority, due date, manual…); sub-issue display toggles; sidebar quick-filters.
- **View subscriptions**: personal or Slack-channel notifications when issues are **added to / completed in / canceled from** a view (own actions excluded) — effectively saved-search alerting.
- **Favorites** star any view/project/customer/etc.; favorited view can be your home. Filtered-view share by URL (`Cmd/Ctrl+Shift+C`); ad-hoc lists via `/issues/ENG-123,ENG-456`.
- **Keyboard-first + command palette**: every action via `Cmd/Ctrl+K`; single-key shortcuts (`C`, `P`, `L`, `Shift+E`, `Shift+D`, `Shift+M`, `F` filter, `O`-then-`V`/`T` navigation, `G I` inbox); `Cmd/Ctrl+I` toggles detail sidebar. Desktop tabs with per-tab history + pinned tabs (2026).
- **Insights** (Business+): analytics panel (`Cmd/Ctrl+Shift+I`) on any view/cycle/project. Measures: issue count, effort (estimate sum), **cycle time** (start→done, scatterplot), **lead time** (create→done), **triage time**, issue age — scatterplots with p25/50/75/95 markers. Dimensions: assignee, status, label, project, team…; optional color segment; burn-up mode with weekly/monthly granularity; CSV export; shareable links.
- **Linear Method** principles: build for the creators; purpose-built over configurable; momentum not sprints; meaningful direction (daily work ↔ initiatives); clarity (standard terms); say no to busy work (automate admin); simple first, then powerful; decide and move on. Practices: n-week cycles, **manageable backlog (let stale issues die; auto-close)**, mix feature+quality work, named owners, project specs, small issues, measure progress by actual work, cross-functional teams, write a changelog.

---

## 7. Automation & Intelligence

### 7.1 Hygiene automations (per team)
- **Auto-close**: inactive issues closed after configurable timeframe.
- **Auto-archive**: completed/canceled issues archived after configurable inactivity (creator notified); also governs project/cycle archival. Archived issues remain searchable/restorable (API: `includeArchived: true`).

### 7.2 Git/GitHub automation (the flagship)
- **Linking**: branch name containing issue ID (via "Copy git branch name" `Cmd/Ctrl+Shift+.`), PR title/description ID, or **magic words**.
  - Closing: *close(s/d/ing), fix(es/ed/ing), resolve(s/d/resolving), complete(s/d/completing), implement(s/ed/ing), "linear issue"* → runs full automation incl. done-on-merge.
  - Non-closing: *ref(s), references, part of, related to, relates to, contributes to, toward(s)* → link only.
  - Suppress: `skip`/`ignore` + ID. Multiple issues per PR ("Fixes ENG-1, DES-5"); multiple PRs per issue → **status flips only after the last linked PR merges**.
- **Status transitions** (each mappable to any team status): branch pushed → In Progress; PR opened → X; review requested → X; **ready for merge** (requires branch protection; mergeable state) → X; PR merged → Done. **Branch-specific rules** by exact name or regex on the *target* branch (merge to `staging` → "In QA", to `main` → "Deployed").
- Copy-branch-name can also **auto-assign to you and move to started**.
- Commit linking (org webhook): commit pushed → In Progress; reaches default branch → Done.
- PR review states (reviewer avatars, approvals/changes-requested) render on the issue's attachment; preview-deploy links (Vercel/Netlify/CF/Amplify) auto-detected.
- **GitHub Issues Sync**: one-way (many repos → team) or two-way (one repo per team); syncs title, description, status, assignee, labels, sub-issues, comments. Personal GitHub account linking maps activity to Linear users. Linkbacks post issue context on the PR; Autolink makes `ENG-123` clickable in GitHub.

### 7.3 Slack / Teams
Issue creation from messages (≤10 templates), `/linear`, **@Linear agent in Slack** with natural language + admin-written guidance; **synced comment threads** (Linear ↔ Slack, incl. close/duplicate updates); unfurls with in-Slack actions (assign, comment, subscribe); team/project/initiative/view/personal notifications; **auto-created project Slack channels** (May 2026); multiple Slack workspaces (Enterprise); Microsoft Teams parity basics (Apr 2026).

### 7.4 Asks
Intake product (Business+; web forms Enterprise): Slack/DM/email/web-form submissions → templated (form fields) → team **Triage**, with synced conversation back to the requester; custom email domains; email = subject→title, body→description; **Asks Agent** (May 2026) matches templates from a bare @mention. Non-Linear users can submit.

### 7.5 AI (Product Intelligence / Linear Agent)
- **Product/Triage Intelligence**: suggests assignee/labels/project/priority from similar historical issues, flags duplicates & related, **auto-apply rules** per property/value.
- **Linear Agent** (Mar 2026, beta): workspace-grounded chat (Cmd/Ctrl+J, mobile, Slack/Teams, @mentions in comments); research/synthesis, drafting issues from notes, backlog theme analysis, risk flagging, project catch-ups; **Skills** (saved reusable workflows, shareable across teams), **Automations** on triage entry (Business+), **MCP support** (external context: Notion, PostHog, Glean…), **Code Intelligence** (May 2026: repo access to reason about the product), **Coding Sessions** (Jun 2026: writes code via Claude Code/Codex — triage→reviewed fix inside Linear), **Linear Diffs** (native code review). Agent-assisted project updates. Enterprise-managed MCP authorization (Jul 2026).

---

## 8. Developer Platform

### 8.1 GraphQL API
- Single endpoint `https://api.linear.app/graphql`; introspectable; TS SDK (`@linear/sdk`).
- Auth: personal API key (`Authorization: <key>`) or OAuth Bearer.
- Core queries: `viewer`, `user(s)`, `team(s)` (→ issues, members, states, cycles, labels), `issue(id)` (accepts UUID **or** `ENG-123` shorthand), `workflowState(s)`, `project(s)`, `cycle(s)`, plus customers/requests/initiatives/documents.
- Mutations follow a uniform `{entity}{Verb}` convention: `issueCreate`, `issueUpdate`, `issueDelete`/archive, `commentCreate`, `projectCreate/Update`, `cycleCreate`, `attachmentCreate`, `webhookCreate`, `issueRelationCreate`, etc., each returning `{ success, entity }`. `issueCreate` without `stateId` defaults to first Backlog state **or Triage if enabled**.
- Filtering via typed `filter` argument (comparators like `eq/in/contains`, nestable and combinable); cursor pagination (`first/after`, nodes/pageInfo) + `includeArchived`.
- **Rate limits**: API key 5,000 req/h + 3M complexity points/h per user; OAuth app 5,000 req/h + 2M points; unauthenticated 600 req/h; single-query cap 10,000 points; `X-RateLimit-*` and `X-Complexity` headers; `RATELIMITED` error code. Guidance: use webhooks, not polling.

### 8.2 Webhooks
- Entities: Issues, Attachments, Comments, Labels, Reactions, Projects, Project updates, Documents, Initiatives, Initiative updates, Cycles, Customers, Customer requests, Users; plus special **Issue SLA** and **OAuthApp revoked**, and agent-platform events.
- Payload: `action (create|update|remove)`, `type`, `actor`, `createdAt`, `data` (full serialized entity), **`updatedFrom` (previous values — diff-ready)**, `url`, `webhookTimestamp`, `webhookId`. Headers: `Linear-Event`, `Linear-Signature` (**HMAC-SHA256 of raw body**, verify + ~60s timestamp window), `Linear-Delivery` UUID.
- Scope: one team or `allPublicTeams`. Managed by admins or `admin`-scoped OAuth apps. Delivery: HTTPS, 200 = success, 5s timeout; retries at 1 min / 1 h / 6 h; auto-disable after persistent failure. Published source IP list.

### 8.3 OAuth 2.0 & agent platform
- Standard auth-code flow + PKCE + state; token endpoint `api.linear.app/oauth/token`; access tokens ~24 h + refresh tokens (30-min replay grace); revoke endpoint; client-credentials flow for server-to-server (30-day app tokens).
- **Scopes**: `read` (always), `write`, `issues:create`, `comments:create`, `timeSchedule:write`, `admin`, `customer:read/write`, `initiative:read/write`, agent scopes `app:assignable`, `app:mentionable`.
- **`actor=user` vs `actor=app`**: app actor = service-account identity (resources created *as the app*); requires workspace-admin install; cannot request `admin` scope.
- **Agent sessions**: auto-created on @mention or delegation; `AgentSessionEvent(created)` webhook carries issue context + comments + `promptContext`; agent must emit a **`thought` activity within 10 s** to acknowledge; session state derives automatically from emitted activities (thought/action/response elicitation…); delegation sets agent as **delegate**, human stays assignee; `PermissionChange` webhooks on team-access changes; agents non-billable.

### 8.4 REST design takeaways for Beacon
Uniform per-entity CRUD + `success` envelopes; ID + human-key lookup (`ENG-123`); typed filter grammar; cursor pagination with archived toggle; HMAC-signed webhooks with `updatedFrom` diffs and staged retries; request + complexity dual rate limits; scope names as `entity:verb`.

---

## 9. Permissions Model

| Role | Notes |
|---|---|
| **Workspace Owner** (Enterprise) | Billing, security, audit logs, exports, OAuth approvals, team-access management; SCIM `linear-owners` group |
| **Admin** | Member/role management, workspace settings, integrations, webhooks; on Free plans everyone is admin |
| **Team Owner** (Business+) | Per-team governance: delete/private/hierarchy, promote owners, delegate label/template/settings/member management; not inherited to sub-teams |
| **Member** | Full standard features across accessible teams; no workspace admin pages |
| **Guest** (Business+, billed as member) | Only explicitly granted teams; member-level actions inside them; **no** workspace views, initiatives, customer data, or other teams' issues even in shared multi-team projects |

Visibility rules: public teams visible/joinable by all members; **private teams** invisible outside membership; private sub-teams "restricted" vs "private"; initiatives always workspace-visible (minus guests) even when containing private-team projects; no private issues — privacy is team-granular. Security notes: workspace-wide integrations can leak to guests; team creation restrictable to admins.

---

## 10. Top 15 Mechanics Worth Copying into Beacon (ranked)

1. **Status *types* behind per-team statuses** — add `type ENUM(triage|backlog|unstarted|started|completed|canceled|duplicate)` + per-team `workflow_states` table; Beacon's fixed work_item status enum becomes the type layer, unlocking custom names with safe automation/reporting.
2. **Cycles keyed to team with auto-repeat + auto-rollover** — `cycles(team_id, number, starts_at, ends_at, cooldown_ends_at)` + `work_items.cycle_id`; a scheduled job closes/creates cycles and moves unfinished non-backlog items forward — fits cleanly beside work_items and the events table.
3. **Triage as a first-class state + team intake queue** — issues from connectors/non-team-members land in `triage`; accept/decline/duplicate/snooze actions are just event rows in Beacon's append-only events table.
4. **Git magic words + status transition mapping** — Beacon already has a GitHub connector; add per-team mapping {branch push, PR open, review requested, merge} → status, parsing `Fixes BEA-123`, with "last-PR-merged wins".
5. **Issue relations with auto-demote** — one `work_item_relations(item_id, related_id, type)` table; blocks→related on blocker completion, and duplicate-merge moving context to the canonical item (Beacon has parent hierarchy but no relations yet).
6. **Human-readable issue keys** — `teams.key` + per-team sequence → `BEA-123`; needed for git automation (#4), URLs, and search.
7. **Label groups with single-select exclusivity** — add `label_groups` + group_id on labels; enforce one-per-group at write time — turns Beacon's flat labels into typed taxonomies (Type/, Severity/) that power analytics.
8. **Project health updates + reminder/staleness engine** — `project_updates(project_id, health, body, author)` with cadence reminders and "update missing" derivation; Beacon's AI chat can copy "Write with Agent" drafting from the events table.
9. **Cycle/project burnup from snapshots (scope/started/completed)** — daily snapshot rows computed from events; unestimated items count as 1 point — Beacon's event-sourced status already contains the history to backfill.
10. **Auto-close/auto-archive of stale items** — per-team inactivity thresholds emitting events; enforces the Method's "manageable backlog" with zero UI cost.
11. **Sub-item property inheritance + parent/child auto-close** — on create, inherit team/priority/project/cycle (not labels); optional both-direction done propagation — direct extension of Beacon's existing parent hierarchy and event-derived status.
12. **Inbox with subscriptions, snooze, and reminders** — `subscriptions(user_id, work_item_id)` auto-created on create/assign/mention + `notifications` table with snoozed_until; urgent-priority pushes immediately.
13. **Saved views with subscription alerts** — persist filter JSON as `views(scope, owner, filters, display)`; notify on added/completed/canceled matches — cheap to build over Beacon's existing filters and very high leverage.
14. **SLA rules engine (first-match, priority-driven, business days)** — ordered rules table evaluated on item create/update; mutually exclusive with due date; risk states derived, not stored — complements Beacon's existing due-date column.
15. **Webhook envelope with `updatedFrom` + HMAC + 1m/1h/6h retries** — Beacon's events table already captures diffs; expose it outbound in Linear's exact envelope shape for a best-in-class integration surface.

## Sources

[Conceptual model](https://linear.app/docs/conceptual-model) · [Teams](https://linear.app/docs/teams) · [Sub-teams](https://linear.app/docs/sub-teams) · [Creating issues](https://linear.app/docs/creating-issues) · [Parent & sub-issues](https://linear.app/docs/parent-and-sub-issues) · [Issue relations](https://linear.app/docs/issue-relations) · [Labels](https://linear.app/docs/labels) · [Workflows](https://linear.app/docs/configuring-workflows) · [Cycles](https://linear.app/docs/use-cycles) · [Triage](https://linear.app/docs/triage) · [Estimates](https://linear.app/docs/estimates) · [Priority](https://linear.app/docs/priority) · [SLAs](https://linear.app/docs/sla) · [Due dates](https://linear.app/docs/due-dates) · [Inbox](https://linear.app/docs/inbox) · [Comments](https://linear.app/docs/comment-on-issues) · [Projects](https://linear.app/docs/projects) · [Milestones](https://linear.app/docs/project-milestones) · [Project graph](https://linear.app/docs/project-graph) · [Project dependencies](https://linear.app/docs/project-dependencies) · [Initiatives](https://linear.app/docs/initiatives) · [Initiative & project updates](https://linear.app/docs/initiative-and-project-updates) · [Templates](https://linear.app/docs/issue-templates) · [Custom views](https://linear.app/docs/custom-views) · [Insights](https://linear.app/docs/insights) · [Customer requests](https://linear.app/docs/customer-requests) · [Asks](https://linear.app/docs/linear-asks) · [GitHub](https://linear.app/docs/github) · [Slack](https://linear.app/docs/slack) · [Members & roles](https://linear.app/docs/members-roles) · [Method](https://linear.app/method/introduction) · [GraphQL](https://linear.app/developers/graphql) · [Webhooks](https://linear.app/developers/webhooks) · [OAuth](https://linear.app/developers/oauth-2-0-authentication) · [Rate limiting](https://linear.app/developers/rate-limiting) · [Agents](https://linear.app/developers/agents) · [Changelog](https://linear.app/changelog)
