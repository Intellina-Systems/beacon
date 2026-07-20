# Beacon Native Issue Tracking — Research Synthesis & Build Plan

> Synthesized 2026-07-17 from four deep-dive reports in this folder:
> [linear.md](linear.md) · [ms-teams.md](ms-teams.md) · [issue-trackers.md](issue-trackers.md) (Jira, GitHub, Shortcut, Height) · [work-management.md](work-management.md) (Asana, ClickUp, Monday, Notion).
> Goal: add Linear-class native issue tracking to Beacon — create issues, assign to team members, organize teams — designed around Beacon's existing event-driven, multi-tenant schema (`lib/db/schema.ts` @ c614eed).

---

## 1. The one-paragraph verdict

Every product studied converges on the same handful of mechanics, and **Beacon's append-only `events` table is the substrate all of them retrofitted late**: Linear's activity log, Jira's changelog (which powers its unique `CHANGED`/`WAS` queries), Teams' system messages, Asana's events API, and every vendor's 2025–26 AI layer are all *projections over an event stream*. Beacon has that stream natively. The build plan is therefore not "clone Linear" — it's: adopt the industry-consensus data model (keys, states-with-categories, rank, relations, watchers, cycles, templates), and derive everything dynamic (status, blockers, burnups, notifications, automations, AI) from the events table Beacon already has.

## 2. Where the industry agrees (adopt these without debate)

1. **Custom status names over fixed canonical categories.** Linear (6 types), Jira (3 categories), Shortcut (3), ClickUp (status types), Notion (status groups) all converged here: teams rename/add statuses freely, but every status maps to a machine-readable category that automation and reporting key off. Beacon's 7-value `WORK_ITEM_STATUSES` enum *is already the category layer* — add a per-team `workflow_states` table on top when custom names are needed; don't build Jira's transition graph (nobody copied it; it's their admin tax).
2. **Human-readable issue keys** (`BEA-123`): per-team prefix + sequence. Prerequisite for git automation, URLs, search, and agent correlation (the connectors already regex for this pattern — `extractWorkItemKey` in `lib/connectors/types.ts`).
3. **Git-drives-status**: closing keywords ("fixes BEA-123") + issue keys in branch names → auto-link + status transitions on branch push / PR open / review / merge. Linear's flagship, GitHub-native, Jira triggers, Shortcut/Height branch conventions — everyone has it. Beacon's GitHub connector already parses keys; extending it to drive status is the single highest-leverage, lowest-cost feature in this entire document.
4. **Watchers/subscribers + auto-subscribe + a personal inbox** split into "assigned to me" (worklist) vs "following" (awareness feed), with snooze/archive. Universal.
5. **Ordering via fractional/lexicographic rank** (Jira LexoRank, Linear sortOrder, Planner orderHints, GitHub fractional positions). One canonical `rank text` column on work_items (Jira model) beats per-view ordering (GitHub model) for simplicity.
6. **Relations**: blocks/blocked-by, duplicate-of, related — one edge table. Linear's refinements worth copying: auto-demote blocks→related when the blocker completes; duplicate-merge moves attachments/context to the canonical item.
7. **Cycles/sprints that run themselves**: auto-repeating time-boxes, auto-rollover of unfinished work, auto-add of active issues (Linear), carry-over automation (ClickUp/Notion/monday), velocity from the last ~3 completed cycles. Jira's differentiator — scope-change tracking — is literally an event log about sprint membership, i.e. free on Beacon's architecture.
8. **Templates for creation** (per-team defaults, pre-filled properties) and, later, **validated public intake forms** (GitHub YAML forms / Asana Forms / Linear Asks) for non-members.
9. **Boards/views are saved filters over one pool of items, never containers** (Jira boards, GitHub Projects views, Height smart lists, Notion linked views).
10. **Automation = trigger → conditions → actions on an event bus** + a scheduler for time-based triggers (due-date-approaching, overdue, recurring), with per-execution audit logs. Every vendor built an event bus to power this; Beacon starts with one.
11. **Estimates with a per-team scale, unestimated items counting as 1 point** in all progress math (Linear's trick that makes stats work without mandatory estimation).
12. **Narrated health separate from derived progress**: scheduled "on track / at risk / off track" project updates with reminder engines and AI drafting (Linear project updates, Asana status updates, GitHub Projects status updates).

## 3. Genuine design decisions (where products disagree)

| Decision | Camps | Recommendation for Beacon |
|---|---|---|
| **Single vs multi-assignee** | Single: Jira, Linear, Asana ("one throat to choke"). Multi: GitHub (10), Shortcut, ClickUp, Height, Planner | **Keep single `assigneeMemberId`** + watchers as collaborators. Simpler, matches the attribution model events need. Revisit only on strong user pull. |
| **Issue's home: team vs project** | Linear/Shortcut: team owns the issue (keys, workflow); projects span teams. Jira/GitHub: project/repo owns it. Asana: neither — multi-homed | Work items currently require `projectId`. **Add optional `teamId`** for routing/triage/keys (Shortcut/Linear model). Defer Asana multi-homing — high power, high complexity; revisit at the "initiatives" stage. |
| **Canonical rank vs per-view order** | Jira: one global rank. GitHub: order per view | **One canonical `rank`** — matches "one source of truth" and is 10× simpler. |
| **Custom fields** | Jira: schemes/contexts/screens (powerful, bureaucratic). Height: flat global attribute registry. Linear: refuses them | **Defer**; when needed, Height's flat registry (`field_definitions` + `attributes jsonb`) — never Jira's scheme system. |
| **Comments: table vs events** | Everyone: separate comments. Height: real-time chat per task | **Store comments as events** (`type: 'chat.message'`, `workItemId`) — one timeline for discussion + telemetry, free AI context, and Teams' insight that system events belong *inside* the conversation. |
| **Feature gating** | ClickUp: per-Space ClickApps toggles. Others: plan tiers | **Adopt a lightweight `workspace_features` flags row** before shipping sprints/goals/forms, so small teams keep a simple surface. |

## 4. Beacon's unfair advantages (lean into these)

- **History-aware queries for free**: only Jira can answer "what got blocked last week" (JQL `CHANGED`), because only Jira keeps a changelog. Beacon's `events` table answers it with one query — surface this in AI chat and saved views.
- **Sprint scope-change tracking, burnups, velocity** = folds over events. Jira built a dedicated burndown log; Beacon emits `sprint.item_added` / `estimate.changed` events and derives everything, backfillable from history.
- **Automation without new infrastructure**: rules evaluated in `ingestEvents()` — the bus exists; competitors metered and billed theirs.
- **Outbound webhooks**: the events table is literally the outbox. Ship Linear's envelope (`action`, `data`, `updatedFrom` diff, HMAC signature, 1m/1h/6h retries) as a delivery worker over it.
- **Agent-native from day 1**: Linear added a delegate field and agent sessions in 2026; Beacon already has API keys, an agent event taxonomy, and the beacon-insights skill. Adding `delegate` semantics (agent acts, human owns) is one column.
- **AI ladder position**: every vendor is climbing assist → Q&A → AI-in-automations → agents → proactive risk. Beacon's chat is already at step 2 grounded in real events; step 5 (risk/insights) is the `insights` table waiting for a pipeline.

## 5. Phased build plan

### Phase 1 — Core native issues (the current ask: create, assign, organize)
Schema:
- `work_items`: add `teamId` (nullable FK), `rank` (fractional-index text), `estimate` (real, nullable).
- `teams`: add `key` (e.g. "BEA") + per-team sequence → generate `work_items.key` = `BEA-123` on create.
- New: `work_item_relations (id, workspaceId, itemId, relatedItemId, type: blocks|duplicate|related)`.
- New: `work_item_watchers (workItemId, memberId, reason: manual|assigned|creator|mentioned)` with auto-subscribe on create/assign.
- New: `work_item_templates (workspaceId, teamId?, name, defaults jsonb)`.
- Event taxonomy: add `task.assigned`, `task.commented` (`chat.message`), `relation.added`, statuses already covered.

Product: quick-create modal (title + smart defaults, template picker), assignment with immediate event + notification, per-team triage queue (accept/decline/duplicate/snooze — pure event actions), inbox page fed from events × watchers, sub-item inheritance rules (team/priority/project on create; optional parent auto-close — extends the existing `statusEffectOf` fold).

### Phase 2 — Cadence & boards
- `cycles (id, workspaceId, teamId, number, startsAt, endsAt, cooldownEndsAt)` + `work_items.cycleId`; cron job (existing `/api/cron` pattern) closes/creates cycles, rolls unfinished items, auto-adds active issues; emit `sprint.*` events.
- Daily snapshot job → burnup/velocity charts (scope/started/completed; unestimated = 1 pt).
- `views (workspaceId, name, ownerId, filters jsonb, layout, groupBy, sortBy)` — saved views/boards over work_items; board drag = rank update.
- GitHub connector: magic-word parsing → status transitions (branch push → in_progress, PR open → in_review, merge → done; per-team mapping later; "last linked PR merged wins").

### Phase 2 addition — Multi-org workspace switching
Added 2026-07-18, not from competitor research but from real usage friction: the data model already supports one login account holding memberships in multiple workspaces (`members` has a *per-workspace* unique index on `(workspaceId, authUserId)`, and `claimInvite` happily creates a second membership row for an existing user), but `getWorkspaceContext()` only ever resolved the oldest membership (`.orderBy(asc(members.createdAt)).limit(1)`) with no way to see or pick another — forcing users into separate accounts per org. Fix: `getWorkspaceContext()` reads all memberships for the session user, resolves the active one from a cookie hint (falling back to most-recently-joined), and returns the full `memberships` list; `POST /api/workspace/switch` verifies membership and updates the cookie; accepting an invite auto-switches into the newly joined workspace; a switcher dropdown replaces the static workspace name in the sidebar when a user has more than one membership.

### Track E (parallel) — Browser extension: AI-chat session capture
Chrome/Edge MV3 extension that turns work sessions in ChatGPT / Claude / Gemini / DeepSeek into structured Beacon events — the beacon-insights skill, but for humans in the browser. Injects workspace context, captures user-approved session summaries, posts to `POST /api/events` with a `bcn_` key, adds Project/Work-Item/Status UI on the chat page. Privacy is the load-bearing design: off by default, visible Work-Mode indicator, summaries-not-transcripts, review-before-send, personal chats never touched. Full plan, architecture, backend deltas, and phasing (E1 manual panel → E2 assisted capture → E3 managed rollout) in **[browser-extension.md](browser-extension.md)**. Runs parallel to Phases 1–3; E1 only needs API-key read access to work items.

### Phase 3 — Automation & intelligence
- `automation_rules (workspaceId, triggerEventType, conditions jsonb, actions jsonb, enabled)` evaluated in the ingest path + a scheduler tick for due-date/recurring triggers; executions logged as events. Five starter actions: set status/assignee/priority/label, notify.
- `project_updates (projectId, health, body, authorMemberId)` + reminder cadence + staleness derivation + AI drafting from events.
- Auto-close/auto-archive stale items (per-team thresholds) — the "manageable backlog" hygiene everyone ships.
- Insights pipeline (the empty `insights` table): blocker aging, risk detection, weekly digest — Beacon's step-5 differentiator.
- Later candidates, in rough order: SLA rules, workload/capacity view, forms intake, member tags + structured mentions, goals/OKRs, custom attributes registry, outbound webhooks, multi-homing.

## 6. API design notes (for the eventual public surface)

- **Create**: Shortcut-style one-call create with everything inline + `externalId` idempotency (Beacon's events already dedupe this way).
- **Lookup**: accept internal id *or* human key (`BEA-123`) everywhere (Linear).
- **Status writes**: keep writable (no Jira transition ceremony) but validate against workflow states; every write emits an event.
- **Concurrency**: ETag/If-Match with merge-friendly conflict handling (Planner) once agents and humans co-edit.
- **Webhooks out**: Linear envelope — `action/type/data/updatedFrom`, HMAC-SHA256 raw-body signature, staged retries, auto-disable.
- **Filters**: typed filter object (Linear) rather than a query DSL; history-aware filters ("was blocked in last 7d") as Beacon's special sauce.

## 7. Anti-goals (deliberate omissions, learned from others' scar tissue)

- No Jira workflow transition graph, validators, post-functions, screens, or scheme systems.
- No permission/notification scheme matrices — the 3-role + team-lead model is a feature.
- No per-view manual ordering, no unbounded custom-field proliferation, no custom priorities (fixed 5 levels, like Linear).
- No status stored as truth anywhere new — every stateful feature must be expressible as a fold over events, or it doesn't ship.
