---
name: beacon-insights
description: Send structured progress insights from a coding agent session to Beacon (engineering intelligence layer). Use throughout coding sessions when BEACON_API_KEY is set — emit events at session start, planning, implementation, test runs, blockers, and completion so Beacon can track work-item status and surface blockers to the team.
---

# Beacon Insights

Emit structured events to Beacon as you work so the team's dashboard reflects real progress — what's in flight, what's blocked, what shipped — without anyone writing status updates.

## Setup

Requires two environment variables (ask the user to set them if missing):

- `BEACON_API_KEY` — an API key from Beacon → Settings → API Keys (starts with `bcn_`)
- `BEACON_URL` — the Beacon instance URL (default: `https://beacon-tool.vercel.app`)

If `BEACON_API_KEY` is not set, do nothing — never block or degrade the coding session over telemetry.

## How to send an event

POST to `/api/events` with the API key as a Bearer token:

```bash
curl -sS -X POST "${BEACON_URL:-https://beacon-tool.vercel.app}/api/events" \
  -H "Authorization: Bearer $BEACON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "agent.blocked",
    "task": "BCN-42",
    "engineer": "yohan",
    "reason": "API schema mismatch between client and server",
    "confidence": 0.92
  }'
```

Batch multiple events in one request (up to 100): `{ "events": [ {...}, {...} ] }`.

Send events fire-and-forget in the background. If the request fails, drop it silently — do not retry in a loop, surface errors to the user, or let telemetry interrupt the actual work.

## Event fields

| Field | Required | Notes |
|---|---|---|
| `type` | yes | Dot-namespaced, lowercase, e.g. `agent.blocked` (see taxonomy below) |
| `task` | no | Work-item key or id, e.g. `"BCN-42"` — how Beacon correlates the event to a work item. Infer from the branch name, ticket reference in the task description, or commit messages |
| `engineer` | no | Who's working: name, email, GitHub login, or alias. Use the git user or GitHub login if known |
| `summary` | no | One line, ≤500 chars. Auto-generated from type/task/reason if omitted |
| `reason` | no | ≤2000 chars. For blockers/failures: what went wrong and what would unblock it |
| `confidence` | no | 0–1, how sure you are about the insight |
| `occurredAt` | no | ISO timestamp, defaults to now |
| `externalId` | no | Stable id for deduplication — events with the same source+externalId are ingested once |
| `payload` | no | Arbitrary JSON object for extra structured detail |

## When to emit what

Emit at these moments in a coding session. Any dot-namespaced type is accepted, but these are the types Beacon understands deeply (they drive work-item status):

| Moment | Type | Status effect on the work item |
|---|---|---|
| Session starts on a task | `agent.session_started` | → in_progress |
| Plan is formed | `agent.planning` | — |
| Writing code begins | `agent.implementation_started` | → in_progress |
| Tests pass | `agent.tests_passed` | — (clears blocker signal) |
| Tests fail | `agent.tests_failed` | — (flags blocker signal) |
| Stuck: missing info, failing dependency, needs human decision | `agent.blocked` | → blocked |
| Task finished and verified | `agent.completed` | — (clears blocker signal) |

Guidelines:

- **Always include `task`** when you can identify one — uncorrelated events are far less useful.
- **`agent.blocked` is the highest-value event.** Include a specific `reason`: what is blocking and what would unblock it. This is what gets surfaced to the team.
- Don't spam: one event per lifecycle moment, not one per file edit. A typical session emits 3–6 events.
- **Never include secrets, API keys, tokens, or sensitive file contents** in `summary`, `reason`, or `payload`.
- A `201` response with `{ "inserted": ..., "deduplicated": ... }` means success; `401` means the key is invalid (tell the user once, then stop emitting).

## Example: full session batch

```bash
curl -sS -X POST "${BEACON_URL:-https://beacon-tool.vercel.app}/api/events" \
  -H "Authorization: Bearer $BEACON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      { "type": "agent.session_started", "task": "BCN-42", "engineer": "yohan" },
      { "type": "agent.tests_passed", "task": "BCN-42", "engineer": "yohan", "summary": "42 tests green after auth refactor" },
      { "type": "agent.completed", "task": "BCN-42", "engineer": "yohan", "reason": "Auth refactor done, PR opened", "confidence": 0.95 }
    ]
  }'
```
