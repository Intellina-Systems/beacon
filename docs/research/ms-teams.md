# Microsoft Teams & Work-Management Satellites — Product Inventory and Mechanics

> Research compiled 2026-07-17 from Microsoft Learn (Teams admin docs, Microsoft Graph v1.0, Teams developer platform, Planner/Viva docs) by a Claude research agent. Part of the competitive research set in `docs/research/`. See `SYNTHESIS.md` for cross-product conclusions.

---

## 1. Organizational model: teams, channels, membership, tags

### 1.1 The core containment hierarchy

```
Tenant (Entra ID directory)
└── Microsoft 365 Group  ←— the actual membership/ownership record
    └── Team (a "teamified" group)
        ├── Channels (standard | private | shared), incl. mandatory "General" (primaryChannel)
        │   ├── Messages (root posts + threaded replies)
        │   ├── Tabs (pinned apps: Planner plan, files, websites…)
        │   └── Files folder (SharePoint)
        ├── Tags (teamworkTag → teamworkTagMember)
        ├── Installed apps (teamsAppInstallation)
        └── Planner plans (contained by the *group*, surfaced as channel tabs)
```

Key mechanical insight: **a team is not a membership container — the Microsoft 365 group is**. The team is a "communication skin" over the group; group membership changes sync automatically into the team. Lifecycle is also group-driven: delete/restore/expire the group and the team (and all its plans) follows. This separation of *identity/membership* from *collaboration surface* is Teams' most load-bearing design decision.

- Teams can be **private** (invite-only), **public** (anyone in org can join, up to 10,000 members), or **org-wide** (auto-membership of everyone, ≤10,000-user orgs).
- Every team creation auto-provisions a SharePoint team site; every private/shared channel provisions its *own* separate SharePoint site because file ACLs must match channel membership, not team membership.

### 1.2 Channel types — the three-way membership model

`membershipType` is fixed at creation (`standard` | `private` | `shared`) and cannot be converted later:

| Mechanic | Standard | Private | Shared |
|---|---|---|---|
| Membership | Inherits parent team's full roster | Explicit subset of team members (guests OK) | Explicit; **people need not be in the team at all**; other whole teams can be added; B2B direct connect external users |
| Own SharePoint site | No (folder in team site) | Yes | Yes |
| Ownership | Team owners | Channel owner = creator; only channel owners add/remove members | Same, plus team owners can see/delete but *not read* content unless members |
| Moderation | Yes | No | No |
| Planner tab / bots / connectors | Yes | No | No |
| Limits | 1,000 channels/team total | 30/team, 250 members each | 200 shared/team, 5,000 direct members |
| Guests (Entra B2B guest accounts) | Yes | Yes | **No** (external users join via B2B *direct connect* — no local account) |

Mechanics worth noting:

- **Channel-level settings shadow team settings**: private/shared channels inherit parent-team settings at creation, then diverge independently ("copy-then-fork" avoids live cascading complexity).
- **Orphan-owner auto-promotion**: if the last channel owner leaves the org, a member is automatically promoted (deterministic self-healing of ownership).
- **Membership cascade rule**: removing someone from the *team* removes them from all *private* channels in it — but *shared* channel membership is independent of team membership by design.
- **Sharing topology (shared channels)**: `sharedWithTeams` collection; sharing with a team grants that roster transitive access (`allMembers` vs `members` distinguishes direct vs. transitive). Archiving the parent team severs team-sharing but preserves individual membership.
- **Soft delete everywhere**: channels and teams restore within 30 days with memberships/sharing intact.
- `layoutType` (`post` vs `chat`) lets a channel behave like a forum (root post + nested replies) or a flowing group chat — same storage model, two threading/rendering modes.

### 1.3 Roles and membership records

- Two team roles only: **owner** and **member**, plus **guest** as an identity type (not a role). In Graph, membership is a `conversationMember` with a `roles` array — `["owner"]`, `[]`, or `["guest"]`. The same member resource type is reused for team, channel, and chat membership (one polymorphic membership record across all containers).
- Owners are also members; multiple owners encouraged; owner powers = settings + membership + invitations, not content privileges.
- **Moderators** are a *channel-scoped capability*, not a directory role: owners appoint moderators per standard channel; moderators approve who starts posts, control replies, add/remove other moderators. Stored as `channelModerationSettings` (who can post: everyone/owners/moderators; reply restrictions; whether bots/connectors can post).
- Membership endpoints: `POST/PATCH/DELETE /teams/{id}/members`, `.../channels/{id}/members` — role change is a PATCH on the membership record (mirrors Beacon's `team_members.isLead` pattern).

### 1.4 Guests and external participants (two distinct models)

1. **Guest access (B2B collaboration)**: an actual Entra guest account in your tenant; subject to your conditional access/MFA/compliance; labeled "(Guest)"; capabilities reduced by org-level guest policy + per-team settings. Sensitivity labels can block guest additions per team.
2. **External participants (B2B direct connect, shared channels only)**: *no local account* — tenant-to-tenant trust via cross-tenant access settings; host tenant's policies apply. Federation rather than account provisioning.

Both end up as the same `conversationMember` record with different identity annotations — the membership table is the unifier.

### 1.5 Tags — cheap, orthogonal member grouping

Tags (`teamworkTag` → `teamworkTagMember`) are team-scoped labels applied to people, used purely for **targeting**:

- Three kinds: **custom** (manual: "Designer", "On-call"), **shift-based** (auto-assigned in real time from the Shifts schedule — @mentioning "EngineerOnCall" notifies only people *currently on shift*), and **automatic** (derived from Entra attributes like department/job title).
- @mentioning a tag notifies exactly the tagged members; tags also work as chat recipients.
- Limits: 200 tags/team, 200 members/tag, 25 tags/user/team. Admin governs who may manage tags; "suggested tags" can be seeded.

Mechanically, a tag is a named join table whose *only* behavior is fan-out at mention time — extremely high leverage for low cost.

### 1.6 Team templates

A template = declarative team structure: type, name, description, channel list (with "show by default" flag), apps/tabs to install. Not covered: membership, pictures, channel settings, content, private channels. Custom templates definable in admin center or via Graph (`template@odata.bind` in `POST /teams`). Cloning a team copies channels/tabs/settings/apps optionally but never private/shared channels.

---

## 2. Task management: Planner, Tasks in Teams, To Do, Loop

### 2.1 Planner object model (Graph v1.0) — the canonical shared-task schema

```
Container (M365 group | roster | …)   ← authorization + lifecycle come from here
└── plannerPlan (id, title, container, createdBy, createdDateTime)
    ├── plannerPlanDetails (sharedWith, categoryDescriptions — the 25 label names)
    ├── plannerBucket (id, name, planId, orderHint)          ← board columns
    └── plannerTask
        ├── plannerTaskDetails (description, checklist{}, references{}, previewType)
        └── board-format objects (assignedTo / progress / bucket TaskFormat)
```

**plannerTask properties** (full shape, worth copying):

| Property | Mechanics |
|---|---|
| `planId`, `bucketId` | Task must live in a plan; bucket optional, must belong to same plan. |
| `assignments` | **Open-type dictionary keyed by user ID** → `{assignedBy, assignedDateTime, orderHint}`. Multi-assignee is native; add/remove an assignee = add/remove a key. |
| `percentComplete` | 0–100; UI maps 0 = Not started, 1–99 = In progress, 100 = Completed. Progress is a *scalar*, states are a projection of it. `completedDateTime`/`completedBy` set at 100. |
| `priority` | Int 0–10, lower = more urgent. Buckets: 0–1 Urgent, 2–4 Important, 5–7 Medium, 8–10 Low; canonical writes 1/3/5/9. Numeric scale with named bands = extensible without migration. |
| `orderHint`, `assigneePriority` | **Lexicographic order-hint strings** for user-defined ordering per view. Client computes a string between two neighbors; no renumbering writes, no lock contention. Separate hints per view (plan list, per-assignee list, per-board-column). |
| `appliedCategories` | Open-type set of ≤25 boolean flags; display names live once per plan in `categoryDescriptions` → labels are plan-scoped, tasks store only bit-flags. |
| `startDateTime`, `dueDateTime` | Validated (start ≤ due → else 400). |
| `conversationThreadId` | Pointer to an Exchange group conversation — **task comments are an email thread in the group mailbox**, a cross-service link, not embedded. |
| `checklistItemCount` / `activeChecklistItemCount`, `referenceCount`, `hasDescription` | **Denormalized counters on the list object** so list views never fetch details. |
| `previewType` | `automatic\|noPreview\|checklist\|description\|reference` — which facet renders as card preview. |
| `createdBy`, `completedBy` | identitySets (user + application) — attribution distinguishes "which app did it on behalf of whom." |

**plannerTaskDetails**: `description`, `checklist` (dict keyed by client GUID → `{title, isChecked, orderHint, lastModifiedBy}`), `references` (external links dict). The basic/details split is a list-view vs. drill-down payload optimization.

**Concurrency**: every Planner resource is versioned with an **ETag**; all `PATCH`/`DELETE` require `If-Match`. The service *merges non-conflicting stale writes*; clients handle 409/412 by re-reading and reconciling. ETags are ordinal-comparable.

**Containers**: `plannerPlanContainer.type` = `group`, `roster` (lightweight ad-hoc member list — plans without a group; used by Loop task lists), others in beta. Container decides **authorization** and **lifecycle**. Service quotas surface as typed 403 codes (MaximumAssigneesInTasks ≈ 20, 200 plans/group, etc.).

### 2.2 The Planner app in Teams

One app unifies three back-ends: **My Day / My Tasks** (private To Do tasks + flagged emails + "Assigned to me" aggregated from Planner, meeting notes, Loop); **My Plans** (To Do lists, basic plans, premium plans backed by Dataverse/Project engine); channel tabs pin plans into channels (standard channels only).

- **Task publishing** (frontline): a central team authors a task list and *publishes* it down a **team targeting hierarchy** (admin-uploaded CSV schema); recipient-team managers assign locally; publishers see roll-up reporting per location/list/task. One-to-many task *broadcast* with local ownership and central telemetry.
- **App-powered tasks**: a task can carry a pointer to a Teams app that replaces the task detail view with a custom workflow UI.
- **Premium plans**: sprints, goals linked to tasks, typed dependencies (FS/SS/SF/FF) with auto-scheduling, up to 10 custom fields, baselines, timeline/Gantt with critical path.

### 2.3 To Do integration

To Do is the *personal* aggregation plane: anything assigned to you anywhere materializes in "Assigned to me". Design principle: **shared plans own the task; personal views are projections keyed by assignee** — assignment, not copying.

### 2.4 Loop task lists

A Loop task list component is a portable, embeddable live object (chat, Loop page, Outlook): creating one auto-creates a **roster-contained Planner plan**; title/due/assignee sync bidirectionally; assignees see the tasks in To Do/Planner. The component is a shared file + a roster plan; every surface renders the same tasks — single source of truth, multiple embedded projections.

---

## 3. Governance & permissions

- **Policy layering**: org-level admin policies (who can create teams/private channels/shared channels, per-user) → team-level settings (owner-managed: channel creation, tabs/connectors, @team/@channel toggles) → channel-level settings (owner-managed, forked from team defaults).
- **Sensitivity labels** (Purview): label = named policy bundle applied at team creation, enforcing privacy, guest-add, external sharing, unmanaged-device rules for connected SharePoint sites. Labels flow team → channel sites. Lesson: policy must be *enforced by the platform*, not by convention (the old "classification" strings failed).
- **Lifecycle**:
  - *Expiration*: M365 group expiration policy; owners get renewal notices at 30/15/1 days; **auto-renewal on any activity** (a single channel visit renews silently) → garbage-collect only truly dead teams; expiry ⇒ soft delete, 30-day restore.
  - *Archive team*: freezes posting but keeps content viewable/searchable, **membership changes still allowed**, optional SharePoint read-only; reversible; private channels archived with it. Archive first, delete later.
  - *Archive channel*: per-channel freeze (`isArchived`), independent of team.
- **Compliance plumbing**: messages get compliance copies to system/group mailboxes; DLP/retention/eDiscovery/audit inherit team→channel.

---

## 4. Collaboration mechanics

### 4.1 Messages & threads

`chatMessage` is one resource for chats and channels: `replyToId` implements single-level threading (root post + flat replies); `importance` (`normal|high|urgent`); `subject` on channel posts; `attachments`, inline `hostedContents`; `reactions` with `messageHistory` (reaction audit); soft delete/undelete; `lastEditedDateTime`; `messageType: systemEventMessage` + `eventDetail` — **membership changes, channel renames, etc. are injected into the conversation stream as typed system messages** (the conversation is itself an event log).

### 4.2 Mentions

Mentions are structured, not string-parsed: body HTML contains `<at id="N">` markers, and the `mentions` collection maps each to a `chatMessageMention` whose `mentioned` identity can be a **user, bot, team, channel, chat, or tag**. @person, @team, @channel, and @tag are one mechanism with different fan-out sets; consumers can index "who was mentioned" without parsing text. Owners can disable @team/@channel per team.

### 4.3 Announcements & moderation

Announcement posts are a styled root-post subtype for one-to-many broadcast; combined with channel moderation a standard channel becomes a read-mostly feed. Org-wide teams auto-hide noisy system messages and default to owner-only posting in General.

### 4.4 Activity feed & notification model

- The feed is a per-user inbox of notification cards (4-week retention): actor + reason, activity-type icon, timestamp, location ("Team > Channel"), preview, deep link. Each item also triggers an OS banner per user settings; missed-activity emails as fallback.
- Auto-generated activity: @mentions, replies, reactions, channel follows, app notifications, assignment events.
- **Apps write into the feed via Graph** `sendActivityNotification` (user/team/chat scopes) or bulk `sendActivityNotificationToRecipients` (≤100 users). Payload = `topic` (entityUrl or text + webUrl), `activityType` (**must be pre-declared in the app manifest** with `templateText` like `"{actor} created task {taskId} for you"`), `previewText`, `templateParameters`, typed `recipient` — including team/channel/chat-members recipients for roster-wide fan-out. Notification *types registered up front, content template-parameterized* — this is how notifications stay localizable, filterable, and per-type mutable.

### 4.5 Presence & status

`presence`: `availability` (available, busy, doNotDisturb, focusing, inACall, inAMeeting, presenting, offline…) + finer `activity`, `statusMessage` (with expiry), OOF, work location; **user-preferred state overrides app/session-computed state**; multiple application presence *sessions* aggregated with defined precedence and timeouts; batch get; change-notification subscribable.

### 4.6 Approvals, Shifts

- **Approvals app**: request→approve/reject workflow from chat/channel or templates; records in Dataverse; roles requester/responder/viewer; e-signature integration; full audit events (created/viewed/approved/rejected/reassigned/canceled). A minimal "decision object" with lifecycle + audit — cheap to copy.
- **Shifts**: schedule per team (`schedule`, `schedulingGroup`, `shift`, `openShift`, `timeOff`, `workforceIntegration`); feeds real-time on-shift tags. The *schedule→dynamic-group* bridge (on-call rotation as a mention target) is directly relevant to engineering on-call.

---

## 5. Meetings & calendar for engineering rituals

- **Channel meetings**: scheduled meetings living *in the channel* — agenda thread, chat, artifacts visible to the whole channel (standing standup with ambient history). Private channels can't schedule meetings.
- **Recording/transcription**: recordings to OneDrive/SharePoint; transcripts as `callTranscript` resources; attendance reports with join/leave times.
- **Recap**: after a meeting, recording, transcript, attendance, shared files, meeting notes (Loop components — collaborative agenda/notes/**follow-up tasks that sync into Planner/To Do**).
- **Intelligent recap** (Teams Premium / Copilot): AI summary notes; **AI-suggested follow-up tasks/action items** mined from the transcript; chapters/topics; personalized timeline markers — when *your* name was mentioned, screen shares, join/leave; speaker timeline.
- **Copilot in meetings**: live Q&A over the transcript; recap queries after.
- **Graph subscription hooks**: change notifications when recordings/transcripts become available — the integration point for shipping standup transcripts into an external intelligence layer like Beacon.

The pattern: **every ritual leaves structured residue** (transcript → summary → action items → tasks assigned in the same graph), and every artifact is queryable/subscribable.

---

## 6. Extensibility & Graph API essentials

### 6.1 Teams app model

An app = manifest + capabilities, installable to scopes (personal, chat, channel/team, meeting):

- **Tabs**: iframed web apps pinned to channels/chats/personal rail.
- **Bots**: conversational endpoints; proactive messages into channels.
- **Message extensions**: search/action commands from the compose box or on a message (message → work-item promotion).
- **Incoming webhooks / Workflows**: per-channel webhook URLs accepting JSON card payloads (28 KB, 4 req/s); O365 connectors retired in favor of **Workflows (Power Automate)**; notification bots are the durable path.
- **Adaptive Cards**: declarative JSON card format — the universal render unit for bot/webhook/notification content, with action buttons (dialogs for structured input).
- Apps must be re-validated for shared/private channels (membership differs from team).

### 6.2 Graph endpoints cheat-sheet

| Concern | Endpoints |
|---|---|
| Teams | `POST /teams` (with template), `GET /me/joinedTeams`, `PATCH /teams/{id}`, `/archive`, `/clone` |
| Channels | `GET/POST /teams/{id}/channels`, `/primaryChannel`, `/channels/{id}/archive`, `/provisionEmail`, `/incomingChannels`, `/allChannels` |
| Membership | `POST/PATCH/DELETE /teams/{id}/members`, `/channels/{id}/members`, `GET /channels/{id}/allMembers`, `/doesUserHaveAccess` |
| Messages | `GET/POST .../messages`, `.../replies`, `GET /teams/getAllMessages`, `chatMessage-delta`, `setReaction`, soft-delete/undo |
| Tags | `GET/POST /teams/{id}/tags`, `/tags/{id}/members` |
| Planner | `GET /groups/{id}/planner/plans`, `POST /planner/plans`, `/plans/{id}/tasks` & `/buckets`, `POST /planner/tasks`, `GET/PATCH /planner/tasks/{id}` (+`/details`), `GET /me/planner/tasks`; *all writes need If-Match etags; premium plans not in this API* |
| Notifications | `sendActivityNotification` on user/team/chat; bulk to ≤100 recipients |
| Shifts | `/teams/{id}/schedule` + shifts/timeOff/schedulingGroups; `workforceIntegration` |
| Meetings | `/onlineMeetings`, transcripts/recordings, attendance reports; `/presence` |

### 6.3 Change notifications (webhooks)

- `POST /subscriptions {changeType, notificationUrl, resource, expirationDateTime, clientState}`; Teams-resource subscriptions expire in ≤ ~60 min and must be renewed continuously; validation handshake on the URL.
- Subscribable: teams, channels, chats, `chatMessage` at tenant/team/channel/chat/user scopes, `conversationMember` at team/chat/channel scopes, app installations, presence, call recordings/transcripts.
- Two payload styles: *without resource data* (ids; you call back) and **rich notifications with encrypted resource data** (no callback needed). Lifecycle notifications warn of missed/expired subscriptions.
- Strict anti-polling policy: >1 poll/day of a resource is a ToS violation; delta endpoints + subscriptions are the sanctioned pattern. Planner has no webhooks in v1.0 — pollers use etag comparison + delta (beta).

---

## 7. Copilot/AI features relevant to status intelligence

- **Copilot in chat/channels**: summarize a conversation/thread with citations back to messages.
- **Intelligent recap / Copilot in meetings**: transcript → notes, action items, chapters, per-person markers.
- **Planner Agent** (GA 2026, Copilot license): goal→plan generation (buckets/tasks/subtasks from natural language); can *execute* certain tasks itself; **automatic status reports** (scheduled, customizable status emails from plan state — the direct analogue of Beacon's digest insights); task chat.
- **Viva Goals** (OKR layer; retired Dec 31 2025, but the model is instructive): Objectives → Key Results → Initiatives; alignment tree org→team→individual; periodic **check-ins** updating progress + status with score 0.0–1.0; integrations pull KR progress automatically from data sources (Azure DevOps queries, Planner completion %) so goal progress is a *derived metric over the work graph*.

The common thread: Microsoft's AI features are all **projections over already-structured event/task/transcript data** — the structure is what makes the AI layer cheap.

---

## Top 10 mechanics worth copying into Beacon (ranked)

1. **Planner buckets as configurable board columns with lexicographic order hints.** Add a `buckets` table (`id, project_id, name, order_hint`) and `work_items.bucket_id` + `work_items.order_hint` (text, lexicographic) so each project gets a customizable kanban without status-enum migrations; drag-reorder is a single-row update. Keep `status` as the canonical progress projection.
2. **Channel-style scoped conversation containers per team/project.** `channels` (`workspace_id, team_id|project_id, name, membership_type`) + `messages` (`channel_id, reply_to_id, body, author_member_id`); render relevant `events` rows *into* the thread as typed system messages — conversation and telemetry in one timeline.
3. **@mentions as structured records driving notifications off the event stream.** Store mentions as `(message_id, mentioned_kind: member|team|tag, mentioned_id)` rows extracted at write time; emit a `mention.created` event per resolved recipient; fan out via the existing events table → notification feed. Makes "who was pinged about this work item" queryable for the AI chat.
4. **Tags: lightweight member-targeting groups orthogonal to teams.** A `member_tags` table + join to members: "@oncall", "@reviewers", "@frontend" reach a role-based subset without restructuring teams. Can auto-derive from `members.skills`/`title` (Teams' "automatic tags"); a future on-call rotation flips tag membership like Shifts.
5. **ETag/If-Match optimistic concurrency with merge-friendly conflicts on work items.** Add a `version`/`rev` column checked on PATCH; accept non-conflicting stale writes; 409/412 on real conflicts. The difference between "last write wins" and safe multi-actor editing once AI agents and humans both write.
6. **App-registered notification types with template parameters.** A `notification_types` registry (`type, template_text`), notifications emitted as typed records referencing an entity + `templateParameters`, per-member per-type mute settings. Notifications become a subscriber of the event stream, and the AI can reason over *why* someone was notified.
7. **Assignment dictionaries + "Assigned to me" as a projection (To Do model).** `work_item_assignments` (`work_item_id, member_id, assigned_by_member_id, assigned_at, order_hint`) — multi-assignee, attribution, a per-member ordered "my work" view, clean `task.assigned` events. Personal surfaces are queries over assignments, never copies.
8. **Group-driven lifecycle: soft delete, archive-as-freeze, activity-based expiration.** `archived_at`/`deleted_at` on teams and projects; enforce read-only semantics on archived; use `events.occurredAt` per project as the activity signal to auto-flag stale projects (an insight of kind `recommendation`). Beacon's event stream makes "auto-renewal on activity" a one-query feature Teams needed a whole policy engine for.
9. **Meeting-ritual residue → tasks (intelligent recap pipeline).** Meeting artifact → AI summary → extracted action items as *proposed* work items (status `backlog`, provenance `meeting`, linked `source_event_ids`) + per-member markers as events. Key mechanic: suggested tasks are **first-class objects a human confirms**, not text in a summary. Beacon's `knowledge_signals` is 80% of this; add a promote-to-work-item flow.
10. **Containers as the single trust boundary.** Every scoped object (project, channel, board) carries one owning container (workspace/team); permissions resolve through container membership only; cross-team access via a `shared_with_teams` grant join, never by copying members. Keeps richer team structures auditable and "who could have seen this?" a one-query answer.

Honorable mentions: Planner's 0–10 priority with named bands; denormalized child counters on list rows; Approvals as a minimal decision object; premium Planner's typed dependencies (FS/SS/SF/FF).

## Sources

[Teams & channels overview](https://learn.microsoft.com/en-us/microsoftteams/teams-channels-overview) · [Shared channels](https://learn.microsoft.com/en-us/microsoftteams/shared-channels) · [Private channels](https://learn.microsoft.com/en-us/microsoftteams/private-channels) · [Manage tags](https://learn.microsoft.com/en-us/microsoftteams/manage-tags) · [Guest access](https://learn.microsoft.com/en-us/microsoftteams/guest-access) · [Team templates](https://learn.microsoft.com/en-us/microsoftteams/get-started-with-teams-templates) · [Sensitivity labels](https://learn.microsoft.com/en-us/microsoftteams/sensitivity-labels) · [Team expiration & renewal](https://learn.microsoft.com/en-us/microsoftteams/team-expiration-renewal) · [Archive or delete a team](https://learn.microsoft.com/en-us/microsoftteams/archive-or-delete-a-team) · [Planner REST overview](https://learn.microsoft.com/en-us/graph/api/resources/planner-overview?view=graph-rest-1.0) · [plannerTask](https://learn.microsoft.com/en-us/graph/api/resources/plannertask?view=graph-rest-1.0) · [plannerTaskDetails](https://learn.microsoft.com/en-us/graph/api/resources/plannertaskdetails?view=graph-rest-1.0) · [Manage the Planner app](https://learn.microsoft.com/en-us/microsoftteams/manage-planner-app) · [Teams Graph API overview](https://learn.microsoft.com/en-us/graph/api/resources/teams-api-overview?view=graph-rest-1.0) · [channel resource](https://learn.microsoft.com/en-us/graph/api/resources/channel?view=graph-rest-1.0) · [chatMessage resource](https://learn.microsoft.com/en-us/graph/api/resources/chatmessage?view=graph-rest-1.0) · [Teams change notifications](https://learn.microsoft.com/en-us/graph/teams-change-notification-in-microsoft-teams-overview) · [Send activity feed notifications](https://learn.microsoft.com/en-us/graph/teams-send-activityfeednotifications) · [Incoming webhooks](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook) · [presence resource](https://learn.microsoft.com/en-us/graph/api/resources/presence?view=graph-rest-1.0) · [Approvals app](https://learn.microsoft.com/en-us/microsoftteams/approval-admin) · [Intelligent recap](https://learn.microsoft.com/en-us/microsoftteams/intelligent-recap-calls-meetings) · [Viva Goals intro](https://learn.microsoft.com/en-us/viva/goals/intro-to-ms-viva-goals) · [Loop task list sync](https://support.microsoft.com/en-us/office/manage-your-tasks-from-loop-task-lists-and-collaborative-notes-in-planner-94383070-5f2f-4954-8607-7b7ebff5d43e) · [Planner Agent status reports](https://support.microsoft.com/en-us/planner/copilot/generate-automatic-status-reports-with-planner-agent)
