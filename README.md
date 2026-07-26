# Beacon

**The Engineering Intelligence Layer.** Beacon sits above GitHub, coding agents, CI/CD, and communication tools, continuously understanding what's happening across your engineering organization.

> Don't manage tasks. Understand engineering.

Instead of asking *"can everyone give a status update?"*, you ask Beacon *"what's happening?"* — and it already knows.

## How it works

Beacon never stores status. It stores **events** — an append-only stream of everything that happens — and derives everything else from it.

```
GitHub · CI/CD · Coding agents · Docs · Meeting notes
        │
        ▼
Connectors (pull) + Ingestion API (push)
        │
        ▼
Event store (append-only) + Work graph + Knowledge base
        │
        ▼
Intelligence: pulse, blocker detection, AI chat
        │
        ▼
Dashboards · Timeline · Chat
```

- **Connectors** pull signals from tracked sources (GitHub repos) and normalize them into events like `code.commit`, `pr.merged`, `task.status_changed`.
- **Coding agents and CI** push structured events directly:

  ```bash
  curl -X POST https://your-beacon.app/api/events \
    -H "Authorization: Bearer bcn_..." \
    -H "Content-Type: application/json" \
    -d '{ "type": "agent.blocked", "task": "BCN-42", "engineer": "nandu", "reason": "API schema mismatch", "confidence": 0.92 }'
  ```

- **Identity resolution** attributes every signal to the right engineer (GitHub login, agent aliases) and the right work item (key like `BCN-42`, external id).
- **Work item status is a projection** — folding the event stream (`task.started` → in progress, `pr.opened` → in review, `pr.merged` → done, `agent.blocked` → blocked).
- **Blocker detection** finds blocking events with no later unblocking signal.
- **AI chat** answers "who is blocked?", "what slipped this week?", "what did X ship?" grounded in the live stream plus a semantic knowledge base.

## Product surface

| Page            | What it shows                                                        |
| --------------- | -------------------------------------------------------------------- |
| `/pulse`        | Executive dashboard: activity, PRs merged, blockers, work in flight  |
| `/timeline`     | The raw event stream, filterable by source                           |
| `/work`         | Projects → epics → features → tasks with event-derived status       |
| `/team`         | Teams & roster; per-member dashboards with activity and blockers    |
| `/chat`         | Ask anything — tools query events, work, team, blockers, knowledge   |
| `/knowledge`    | Ingest notes/docs/links; AI extracts signals (risks, decisions…)     |
| `/integrations` | Connections, tracked signal sources, API keys, agent setup           |
| `/join/<token>` | Invite landing — sign in with GitHub and join the workspace          |

## Workspaces, roles & teams

All data belongs to a **workspace** (the org container); users are login identities linked to a workspace **member**. Members carry an access role:

- **Admin** — integrations, API keys, invites, teams/projects management, everything.
- **Manager** — Pulse and all teams' dashboards & drill-downs; no config. Optional — a workspace can have none.
- **Engineer** — own teams' timeline/work/chat; roster names only, no peer metrics ("assist engineers, don't monitor them").
- **Team lead** — a per-team flag on an engineer granting manager-like visibility for that team only; leads can report straight to the admin.

**Teams** group members (many-to-many, cross-team work supported; `kind` marks non-technical teams). **Projects** partition the work graph, and signal sources map to a project so ingested items attribute automatically. Admins invite people with a predefined role + team assignments via one-time `/join/<token>` links (7-day expiry).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Drizzle ORM + Postgres (pgvector) · AI SDK · Tailwind 4 + shadcn/ui

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in values
pnpm db:migrate
pnpm dev
```

### Environment

| Variable                                                | Purpose                              |
| ------------------------------------------------------- | ------------------------------------ |
| `POSTGRES_URL`                                           | Postgres with pgvector               |
| `JWE_SECRET`, `ENCRYPTION_KEY`                           | Session + token encryption at rest   |
| `NEXT_PUBLIC_GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`   | GitHub OAuth (sign-in + connector)   |
| `OPENAI_API_KEY`                                         | Chat, embeddings, signal extraction  |
| `CRON_SECRET`                                            | Protects `/api/cron/sync`            |

### Event ingestion API

`POST /api/events` accepts a single event or `{ "events": [...] }` (max 100). Auth via session cookie or `Authorization: Bearer bcn_…` (create keys in Integrations).

```jsonc
{
  "type": "tests.failed",        // required, dot-namespaced
  "source": "cicd",              // optional; defaults by auth context
  "task": "BCN-42",              // optional work item key / id
  "engineer": "nandu",           // optional member name / alias / login
  "summary": "14 tests failed",  // optional; generated if omitted
  "externalId": "run:9182",      // optional idempotency key
  "occurredAt": "2026-07-15T10:00:00Z",
  "payload": { "count": 14 }
}
```

Canonical types Beacon understands deeply (anything dot-namespaced is accepted): `task.*`, `code.commit`, `pr.*`, `ci.*`, `deploy.*`, `agent.*`, `message.posted`, `meeting.held`, `knowledge.*`.

## Principles

- Events over status
- Automatic over manual
- Context over activity
- Intelligence over dashboards
- Assist engineers, don't monitor them

See `docs/BEACON.md` for the full product vision and roadmap, and `AGENTS.md` for contributor/agent guidelines.
