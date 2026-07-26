---
name: beacon-insights
description: Use whenever you start a coding task, form a plan, begin writing or running code, run tests, hit a blocker, finish a piece of work, or every ~15-20 tool calls during an ongoing task — send a progress event to Beacon (engineering intelligence layer) at that moment so its dashboard reflects real, live status. Applies for the entire duration of a task, including long single conversations that never restart — keep emitting periodically until the task is done, not just once at the start.
---

# Beacon Insights

Emit structured events to Beacon as you work — at task start, at each lifecycle moment, and periodically throughout (see cadence below) — so the team's dashboard reflects real, live progress: what's in flight, what's blocked, what shipped. Without this, the dashboard goes stale the moment a task runs long. This is a background, ongoing habit for the duration of a task, not a one-time action.

## Setup

Requires two environment variables, set **once per machine at the OS level** — not per coding tool, not per session:

- `BEACON_API_KEY` — an API key from Beacon → Settings → API Keys (starts with `bcn_`)
- `BEACON_URL` — the Beacon instance URL (default: `https://beacon-tool.vercel.app`)

If they're missing, tell the user to run the setup script for their OS **once**, then restart their terminal/IDE/agent:

- Windows: `powershell -ExecutionPolicy Bypass -File skills/beacon-insights/setup.ps1`
- macOS/Linux: `bash skills/beacon-insights/setup.sh`

This sets them as persistent user environment variables (Windows: `HKCU\Environment` via `[Environment]::SetEnvironmentVariable`; macOS/Linux: exported from the shell profile). Because they live at the OS level, not inside any single tool's config, they're automatically inherited by every coding agent and IDE on that machine — Claude Code, Codex, Gemini CLI, OpenCode, VS Code, Antigravity, whatever's used next — with no per-tool setup and nothing to re-source or repeat at the start of a session.

The same setup script also links this skill folder into `.claude/skills/beacon-insights` (this repo) and `~/.claude/skills/beacon-insights` (every repo) — Claude Code only auto-discovers skills from those two locations, not from an arbitrary path, so this step is required for Claude Code to ever see the skill at all, independent of the env vars. It's a link, not a copy, so it never goes stale. Takes effect on the **next** Claude Code session — it won't retroactively appear in a conversation already in progress.

Do **not** rely on a project's `.env`/`.env.local` file for these — a coding agent's shell commands typically run in fresh, disposable processes that never source it, so the key silently never gets picked up.

If `BEACON_API_KEY` is still not set after that (setup skipped, wrong shell, etc.), do nothing — never block or degrade the coding session over telemetry.

### How this stays loaded

You shouldn't need to be reminded to use this skill. The setup script wires two things so it activates on its own once `BEACON_API_KEY` is set:

- A **Claude Code SessionStart hook** (`~/.claude/settings.json`) that fires a reminder into *every* session — start, resume, `/clear`, compaction — so the instruction is always in context, not left to chance.
- A directive in your **global agent memory** (`~/.claude/CLAUDE.md`, and `~/.codex/AGENTS.md` / `~/.gemini/GEMINI.md` when present) for agents that don't run Claude Code hooks.

Together with the OS-level env var, that means: set up once, and every session on the machine reports progress automatically.

## How to send an event

**Use the helper** — it auto-fills the `repo` and your git identity, times out fast so it can never hang your work, and never fails the caller:

```bash
bash "$HOME/.claude/skills/beacon-insights/send-event.sh" \
  --type agent.blocked --task BCN-42 \
  --reason "API schema mismatch between client and server" --confidence 0.92
```

- Windows: `powershell -File "$HOME\.claude\skills\beacon-insights\send-event.ps1" -Type agent.blocked -Task BCN-42 -Reason "…"`
- Flags: `--type` (required), `--task`, `--summary`, `--reason`, `--confidence`, `--engineer`, `--repo`. Omit `--repo`/`--engineer` and the helper fills them from git.
- Full body or a batch (up to 100): `send-event.sh --json '{ "events": [ {...}, {...} ] }'`.

**Or POST directly** — always include `repo`, cap the time, and silence it:

```bash
curl -sS --max-time 5 -X POST "${BEACON_URL:-https://beacon-tool.vercel.app}/api/events" \
  -H "Authorization: Bearer $BEACON_API_KEY" -H "Content-Type: application/json" \
  -d '{ "type": "agent.blocked", "task": "BCN-42", "engineer": "yohan", "repo": "Intellina-Systems/beacon", "reason": "API schema mismatch", "confidence": 0.92 }' >/dev/null 2>&1 || true
```

Either way it's **fire-and-forget**: if it fails, drop it silently — never retry in a loop, surface errors to the user, or let telemetry interrupt the actual work.

## Event fields

| Field | Required | Notes |
|---|---|---|
| `type` | yes | Dot-namespaced, lowercase, e.g. `agent.blocked` (see taxonomy below) |
| `task` | no | Work-item key or id, e.g. `"BCN-42"` — how Beacon correlates the event to a work item. Infer from the branch name, ticket reference in the task description, or commit messages |
| `engineer` | no | Who's working: name, email, GitHub login, or alias. Use the git user or GitHub login if known |
| `repo` | no | Repository the work is in, e.g. `"Intellina-Systems/beacon"`. The helper auto-fills it from the git remote — always send it so Beacon can show what work is happening in which repo |
| `summary` | no | One line, ≤500 chars. Auto-generated from type/task/reason if omitted |
| `reason` | no | ≤2000 chars. For blockers/failures: what went wrong and what would unblock it |
| `confidence` | no | 0–1, how sure you are about the insight |
| `occurredAt` | no | ISO timestamp, defaults to now |
| `externalId` | no | Stable id for deduplication — events with the same source+externalId are ingested once |
| `payload` | no | Arbitrary JSON object for extra structured detail |

## When to emit what

Emit at these moments in a coding task. Any dot-namespaced type is accepted, but these are the types Beacon understands deeply (they drive work-item status):

| Moment | Type | Status effect on the work item |
|---|---|---|
| Task starts | `agent.session_started` | → in_progress |
| Plan is formed | `agent.planning` | — |
| Writing code begins | `agent.implementation_started` | → in_progress |
| Still actively working, no lifecycle event fits (see cadence below) | `agent.heartbeat` | → in_progress |
| Tests pass | `agent.tests_passed` | — (clears blocker signal) |
| Tests fail | `agent.tests_failed` | — (flags blocker signal) |
| Stuck: missing info, failing dependency, needs human decision | `agent.blocked` | → blocked |
| Task finished and verified | `agent.completed` | — (clears blocker signal) |

### Cadence: this is a running task, not a one-shot ping

A "session" is not a chat window — it's however long the task takes, even if that's one long conversation that never restarts. Don't stop after `agent.session_started`. Keep going:

- Emit a lifecycle event (`agent.planning`, `agent.implementation_started`, `agent.tests_passed`/`failed`, `agent.blocked`, `agent.completed`) whenever one of those moments genuinely happens.
- Between lifecycle moments, if roughly 15-20 tool calls have gone by since your last event and the task is still open, send `agent.heartbeat` with a short `summary` of what's currently in flight. Also send one at any natural checkpoint — a file saved, a build/test run, a todo item completed — whichever comes first.
- Do this for the entire lifetime of the task. If the conversation keeps going after `agent.completed` because a new task starts, treat that as a new task: emit `agent.session_started` again for it.

Guidelines:

- **Always include `task`** when you can identify one — uncorrelated events are far less useful.
- **`agent.blocked` is the highest-value event.** Include a specific `reason`: what is blocking and what would unblock it. This is what gets surfaced to the team.
- Don't spam faster than the cadence above — one event per lifecycle moment or heartbeat tick, not one per file edit.
- **Never include secrets, API keys, tokens, or sensitive file contents** in `summary`, `reason`, or `payload`.
- A `201` response with `{ "inserted": ..., "deduplicated": ... }` means success; `401` means the key is invalid (tell the user once, then stop emitting).

## Example: a long-running task, start to finish

```bash
curl -sS -X POST "${BEACON_URL:-https://beacon-tool.vercel.app}/api/events" \
  -H "Authorization: Bearer $BEACON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      { "type": "agent.session_started", "task": "BCN-42", "engineer": "yohan" },
      { "type": "agent.planning", "task": "BCN-42", "engineer": "yohan", "summary": "Scoped auth refactor: 4 files, no schema change" },
      { "type": "agent.implementation_started", "task": "BCN-42", "engineer": "yohan" },
      { "type": "agent.heartbeat", "task": "BCN-42", "engineer": "yohan", "summary": "Still refactoring session middleware, ~15 tool calls in" },
      { "type": "agent.heartbeat", "task": "BCN-42", "engineer": "yohan", "summary": "Middleware done, updating call sites" },
      { "type": "agent.tests_passed", "task": "BCN-42", "engineer": "yohan", "summary": "42 tests green after auth refactor" },
      { "type": "agent.completed", "task": "BCN-42", "engineer": "yohan", "reason": "Auth refactor done, PR opened", "confidence": 0.95 }
    ]
  }'
```

Note the `agent.heartbeat` entries mid-task — this is what keeps the dashboard live during a long single conversation, not just at the very start and end.
