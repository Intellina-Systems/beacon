# AI Agent Guidelines

This document contains rules and guidelines for AI agents working on this codebase.

## Security Rules

### CRITICAL: No Dynamic Values in Logs

**All log statements MUST use static strings only. NEVER include dynamic values.**

```typescript
// BAD
console.error(`Error for user ${userId}:`, error)

// GOOD
console.error('Error occurred:', error)
```

Rationale: prevents accidental leakage of user IDs, tokens, or internal paths into logs.

### Sensitive Data

Never expose these in logs or API responses to clients:

- `LINEAR_CLIENT_SECRET`, `LINEAR_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `JWE_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
- Decrypted Linear/GitHub access tokens
- Plaintext Beacon API keys (only shown once at creation; only the SHA-256 hash is stored)

Only `NEXT_PUBLIC_*` vars should reach the browser.

---

## Code Quality

### After any TypeScript/TSX edit, run:

```bash
pnpm format
pnpm type-check
pnpm lint
```

Fix all errors before considering a task done. Warnings in existing files are acceptable; new warnings are not.

### UI Components

Use shadcn/ui components from `components/ui/`. Install new ones via:

```bash
pnpm dlx shadcn@latest add <component>
```

### CRITICAL: Never Run Dev Servers

Do not run `pnpm dev`, `next dev`, or any long-running server process. Use `pnpm build` and `pnpm type-check` to verify changes.

---

## Architecture

Beacon is an **Engineering Intelligence Layer** (see `docs/BEACON.md`). The core rule:

> **Never store status. Store events. Everything else is derived.**

GitHub and Linear are *not* the center of the product — they are two connectors among many. The event store is the center.

### Project structure

```
app/
  api/
    events/          # Event ingestion + query (API-key or session auth) — the front door
    keys/            # API key management for agents/CI
    sources/         # Signal source CRUD + manual sync
    work-items/      # Native work graph CRUD
    knowledge/       # Knowledge ingestion (notes, files, links) + signals
    members/         # Team roster CRUD
    integrations/    # Provider helper endpoints (e.g. Linear project/team options)
    cron/sync/       # Hourly connector sync (Vercel cron)
    auth/            # OAuth flows: GitHub, Vercel, Linear
  pulse/             # Executive dashboard (default page when signed in)
  timeline/          # Filterable event stream
  work/              # Work items grouped by derived status
  team/              # Roster + per-member dashboards
  chat/              # AI chat over the event store
  knowledge/         # Knowledge base UI
  integrations/      # Connections, signal sources, API keys, agent setup

lib/
  events/
    taxonomy.ts      # Canonical event types, categories, status-effect fold
    ingest.ts        # ingestEvents(): validate, resolve identities, dedupe, project status
    queries.ts       # listEvents, getPulse, getActiveBlockers, member/daily activity
  connectors/        # One module per source kind; each sync() emits normalized events
    github.ts        # Repo commits/PRs → code.commit, pr.opened, pr.merged…
    linear.ts        # Issues → work item mirror + task.created / task.status_changed
  db/schema.ts       # Drizzle schema (see tables below)
  api-keys.ts        # bcn_* key create/verify (SHA-256 hashed at rest)
  knowledge/         # Ingestion pipeline, embeddings, signal extraction, retrieval
  linear/client.ts   # Linear GraphQL client
  github/            # Octokit client + repo listing helpers
  session/           # Session management (JWE cookies)
  crypto.ts          # AES-256-CBC encrypt/decrypt for stored tokens
```

### Database tables

| Table                 | Purpose                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| `events`              | **Append-only event store — the heart of Beacon.** Deduped by (user, source, external_id) |
| `work_items`          | Epics → Features → Tasks. `status` is a cached fold of the event stream |
| `members`             | Roster with identity aliases (GitHub login, Linear id, agent aliases)   |
| `signal_sources`      | Streams Beacon watches (repos, Linear projects/teams) with sync cursors |
| `connections`         | OAuth connections to providers (Linear, future Slack/Calendar)          |
| `api_keys`            | Hashed ingestion keys for coding agents / CI / plugins                  |
| `knowledge_documents` | Ingested notes/docs/links with embeddings                               |
| `knowledge_signals`   | AI-extracted signals (blockers, risks, decisions…)                      |
| `insights`            | AI-derived findings over the event stream (digest, anomaly…)            |
| `users` / `accounts` / `settings` | Auth and per-user config                                    |

### Event flow

1. Signals arrive: connectors pull (cron `/api/cron/sync` or manual), agents/CI push (`POST /api/events` with `Authorization: Bearer bcn_…`).
2. `ingestEvents()` validates (`rawEventSchema`), resolves `engineer` → member via aliases and `task` → work item via key/external id, dedupes on `externalId`, appends.
3. Status effects fold into `work_items.status` (see `statusEffectOf` in `lib/events/taxonomy.ts`).
4. Dashboards, blocker detection, and chat are read-only projections over the stream.

### Adding a new connector

1. Add the source kind to `SIGNAL_SOURCE_KINDS` in `lib/db/schema.ts` (+ migration).
2. Write `lib/connectors/<name>.ts` exporting `sync<Name>Source(userId, source): Promise<SyncResult>` that maps external activity to `RawEvent`s with stable `externalId`s and calls `ingestEvents`.
3. Register it in the switch in `lib/connectors/index.ts`.
4. Add UI to create the source in `components/integrations/sources-card.tsx`.

---

## Compliance Checklist

Before submitting:

- [ ] No template literals with `${}` in log statements
- [ ] No sensitive data in API error responses
- [ ] Events are appended, never mutated; status is always derived
- [ ] `pnpm format` — no formatting changes
- [ ] `pnpm type-check` — zero errors
- [ ] `pnpm lint` — zero new errors
- [ ] `pnpm build` — successful production build
