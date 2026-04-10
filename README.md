# Beacon — AI-Powered PM Tool

Beacon is an AI-first project management tool that aggregates signals from across your engineering and communication systems, and turns them into recommendations, summaries, and next steps for teams. It is being repurposed from a coding agent template into a PM tool.

> **For AI agents working on this codebase:** This README is the source of truth for what to build, what to strip, and in what order. Follow the priority tiers (P0 → P1 → P2 → P3) in sequence. Do not build P1 features before P0 is complete. Each section has explicit instructions on what to keep, remove, or create.

---

## Two Modes

Beacon is designed to work in two configurations. Both share the same core; the difference is whether AI agents are used to understand the codebase.

### Mode A — Without Code Context

Beacon operates purely as a PM tool. It captures tasks, pulls signals from project management and communication tools (Linear, GitHub Issues, Slack, email), and uses AI to generate recommendations, summaries, and drafts. No codebase access required.

**Best for:** Teams that want AI-assisted PM without giving Beacon access to their repo.

### Mode B — With Code Context (Read-Only Agents)

In addition to Mode A, Beacon routes read-only analysis tasks to AI coding agents (Claude Code, Codex) to understand what is already built, what is missing, and what is at risk — without writing or executing any code.

Agents are used as **code analysts**, not code writers. They read files, grep patterns, trace logic, and return structured findings. Results are cached in Postgres and refreshed on schedule or on demand.

**Best for:** Engineering teams that want Beacon to bridge the gap between what's planned and what's actually in the code.

---

## What This Was (Template)

This codebase started as a **coding agent orchestration tool** built on:
- Vercel Sandbox for isolated code execution
- AI agent routing (Claude Code, Codex, Copilot, Cursor, Gemini, OpenCode) for writing and committing code
- Git branch creation and automated commits
- Sandbox lifecycle management (Keep Alive, timeouts)

All of that execution infrastructure is being replaced with PM-focused features. The auth, database, UI skeleton, AI SDK integration, and MCP support are being kept.

---

## What to Strip (Remove Entirely)

AI agents working on this codebase should remove the following. Do not refactor — delete.

- [ ] Vercel Sandbox creation, management, and lifecycle APIs
- [ ] Keep Alive and sandbox timeout logic
- [ ] Git branch creation and automated commit logic
- [ ] AI-generated branch name feature
- [ ] Code execution agent routing (write/commit prompts to Claude Code, Codex, etc.)
- [ ] All references to `SANDBOX_VERCEL_TOKEN`, `SANDBOX_VERCEL_TEAM_ID`, `SANDBOX_VERCEL_PROJECT_ID`
- [ ] Sandbox duration UI and settings
- [ ] Any UI components related to sandbox status, terminal output, or execution logs
- [ ] `MAX_SANDBOX_DURATION` and `MAX_MESSAGES_PER_DAY` environment variables (replace with PM-specific limits later)

---

## What to Keep

- [x] Multi-user authentication (GitHub OAuth, Vercel OAuth) — keep as-is
- [x] Per-user data isolation (userId on all records) — keep as-is
- [x] Per-user API key management (Anthropic, OpenAI, etc.) — keep, extend for new providers
- [x] Postgres database with Drizzle ORM — keep, schema will be extended
- [x] AI SDK 5 + Vercel AI Gateway integration — keep, repurpose prompts
- [x] MCP server support (Connectors tab) — keep, critical for integrations
- [x] Next.js 15, React 19, Tailwind CSS, shadcn/ui — keep as-is
- [x] GitHub OAuth token per user — keep, used for read-only repo access in Mode B
- [x] Session encryption (JWE_SECRET, ENCRYPTION_KEY) — keep as-is

---

## Database Schema Changes

### Remove
- `tasks.sandboxId` or any sandbox-related columns
- Any execution log or agent output tables tied to code execution

### Add (see P1 and P2 for timing)
- `projects` table — top-level container (name, description, repo URL, owner, status)
- `workItems` table — replaces current `tasks` table concept (title, description, status, priority, assignee, projectId, source, sourceId)
- `signals` table — raw captured signals (type, content, source, metadata, projectId, createdAt)
- `insights` table — AI-processed findings (summary, recommendations, risks, projectId, generatedAt)
- `codeInsights` table — Mode B only; cached agent analysis results (query, findings, repoPath, generatedAt, projectId)

---

## Feature Priorities

---

### P0 — Foundation Cleanup (Do This First)

Goal: Strip the coding agent infrastructure and stabilize the app as a clean base. No new features yet.

**Tasks:**
1. Delete all sandbox-related code, APIs, and UI components (see Strip list above)
2. Remove git branch creation and agent write-routing logic
3. Remove AI branch name generation
4. Update environment variable documentation — remove sandbox vars, keep auth + AI vars
5. Rename or repurpose the `tasks` table to `workItems` with PM-relevant fields (title, description, status, priority, assignee, projectId)
6. Add a `projects` table — every work item belongs to a project
7. Update the main UI to reflect a PM tool, not a coding agent launcher
8. Remove any UI that references sandboxes, agent execution, terminal output, or code running
9. Ensure the app builds and runs cleanly after removals

**Exit criteria:** App runs, users can sign in, create a project, and add work items manually. No sandbox or code execution references remain.

---

### P1 — Core PM Features (Mode A)

Goal: Make Beacon useful as a standalone PM tool without any code context.

**Tasks:**

1. **Project Management**
   - Create, edit, archive projects
   - Project dashboard showing work item counts by status
   - Link a GitHub repo URL to a project (used later in Mode B — store the URL, don't act on it yet)

2. **Work Item Management**
   - Create, edit, delete, assign work items
   - Statuses: Backlog, In Progress, In Review, Done, Blocked
   - Priority levels: P0, P1, P2, P3
   - Assignee field (team member name or GitHub username)
   - Due date field

3. **AI-Assisted Work Item Creation**
   - User describes a feature or problem in natural language
   - AI breaks it into structured work items with title, description, priority
   - Uses AI SDK 5 + Vercel AI Gateway (Anthropic or OpenAI)
   - Prompt: decompose into actionable, independently deliverable items

4. **AI Status Summaries**
   - Per-project: "What is the current state of this project?"
   - Reads all work items, statuses, and assignees
   - Returns a plain-English summary suitable for a stakeholder update
   - User can copy or edit before sending

5. **AI Next Step Recommendations**
   - Given current work item statuses, recommend what to prioritize next
   - Flag items that are blocked or overdue
   - Simple heuristic + AI reasoning, no external signals yet

**Exit criteria:** A PM can manage a project end-to-end using only Beacon. AI features add real value without external integrations.

---

### P2 — Signal Capture & Integrations (Mode A, Enhanced)

Goal: Beacon pulls context from external systems and surfaces it automatically.

**Tasks:**

1. **GitHub Signal Capture (via existing GitHub OAuth token)**
   - Pull open PRs for a linked repo — show as signals
   - Pull open issues — show as signals
   - Detect PRs open >3 days with no review (risk signal)
   - Detect issues with no linked PR (planning gap signal)
   - Run on demand and on a daily schedule

2. **Linear Integration (via MCP)**
   - Connect a Linear workspace via MCP server
   - Sync issues into Beacon work items (one-way, read)
   - Map Linear statuses to Beacon statuses

3. **Notion Integration (via MCP)**
   - Read Notion pages linked to a project (PRDs, specs, meeting notes)
   - Surface as context when generating AI summaries

4. **Slack / WhatsApp Signal Capture (via MCP or webhook)**
   - Accept inbound signals from Slack (via webhook or MCP)
   - AI extracts action items, decisions, and blockers from messages
   - Surfaces them as signals in the project dashboard

5. **Signals Dashboard**
   - Per-project view of all captured signals
   - Grouped by type: PR activity, issue activity, messages, decisions
   - AI synthesizes signals into a daily digest

6. **PRD / Spec Writing Assistant**
   - User describes a feature
   - AI drafts a structured PRD (problem, goals, non-goals, requirements, open questions)
   - Output saved as a Notion page (via MCP) or plain text

**Exit criteria:** Beacon automatically surfaces what is happening across GitHub, Linear, and communication channels. Team needs minimal manual input.

---

### P3 — Code Context Layer (Mode B)

Goal: Use AI (Claude, OpenAI) to read and understand what is actually built in a linked repo — without a sandbox, without cloning, and without executing any code.

#### How Mode B works without a sandbox

The original template used Vercel Sandbox to clone a repo and let agents read/write files. In Mode B we do not need execution — only reading. There are two mechanisms, used together:

**Primary: GitHub MCP Server**
Connect the official GitHub MCP server (already supported via the Connectors tab). This gives the AI model a set of tools to browse the repo interactively via the GitHub API:
- List directory trees and file paths
- Read file contents by path
- Search code across the repo (grep equivalent)
- Read commit history, PR descriptions, and diffs

The AI (Claude or OpenAI via AI SDK 5) is given these MCP tools and a read-only analysis prompt. It browses the repo autonomously and returns structured findings. No sandbox, no cloning, no filesystem access required.

**Fallback: GitHub API + Context Injection**
For targeted, known queries (e.g. "read all files in /src/auth"), Beacon fetches file contents directly via the GitHub REST API using the user's existing OAuth token, then injects them into the AI prompt as context. No agent autonomy — just file content passed to the model.

| | GitHub MCP (primary) | GitHub API injection (fallback) |
|---|---|---|
| Open-ended exploration | Yes | No |
| Targeted file reads | Yes | Yes |
| Requires sandbox | No | No |
| Requires GitHub OAuth | Yes (already in template) | Yes (already in template) |
| Agent autonomy | Yes | No |
| Best for | Audits, gap detection | Specific questions |

> **Important for AI agents implementing this:** No sandbox is created in P3. Do not reintroduce Vercel Sandbox. All repo access goes through GitHub MCP tools or the GitHub REST API. AI prompts must include: "You are a read-only code analyst. Do not attempt to write, edit, create, or delete any files or resources."

**Tasks:**

1. **GitHub MCP Server Integration**
   - Document how to connect the official GitHub MCP server via the Connectors tab
   - The server uses the user's GitHub OAuth token — no additional credentials needed
   - Verify MCP tools available: `get_file_contents`, `list_directory`, `search_code`, `get_commits`

2. **Read-Only Analysis via AI SDK 5**
   - Add an analysis prompt template: system prompt enforces read-only, task prompt describes the analysis goal
   - Use `streamText` or `generateText` from AI SDK 5 with GitHub MCP tools attached
   - Supported models: Claude (Anthropic) and OpenAI — configurable per user via existing API key settings
   - No new agent routing layer needed — use AI SDK 5's tool-use directly

3. **Codebase Audit**
   - User triggers "Audit this repo" for a linked project
   - AI browses file structure and key modules via GitHub MCP tools
   - Returns structured output: features found, incomplete areas, TODOs/FIXMEs, test coverage signals
   - Results saved to `codeInsights` table with timestamp and repo SHA

4. **Gap Detection**
   - Cross-reference work items marked "Done" against what the AI finds in the code
   - Flag mismatches: "Work item marked Done but no corresponding code change found"
   - Flag orphaned code: "Module exists in repo but has no corresponding work item"
   - Uses GitHub API (merged PRs, commits) + AI analysis together

5. **On-Demand Code Questions**
   - PM asks natural language questions: "Is auth fully implemented?", "What does the payments module handle?"
   - For targeted questions: fetch relevant files via GitHub API, inject as context, get AI answer
   - For broad questions: use GitHub MCP tools for autonomous exploration
   - Results cached in `codeInsights` — not re-fetched if asked again within 24 hours

6. **Scheduled Analysis**
   - Nightly lightweight audit using GitHub MCP (configurable, off by default)
   - Compare repo state (latest commit SHA) against last cached insight — skip if no changes
   - Surface new modules or deleted files as signals in the project dashboard
   - Use Vercel Cron (`/api/cron/code-analysis`)

7. **Risk Signals from Code**
   - AI identifies via GitHub MCP: files with no corresponding test files, high-churn modules (touched in many recent PRs), TODO/FIXME density
   - Surfaces as risk signals alongside GitHub issue and Linear signals in the Signals Dashboard

**Exit criteria:** A PM can ask "what has actually been built?" and get a reliable AI-generated answer from the real codebase via GitHub MCP — no sandbox, no execution, no cloning.

---

### P4 — Deep Codebase Understanding via Sandbox + Claude Code / Codex (Optional / Experimental)

Goal: Use Vercel Sandbox to clone the full repo and give Claude Code or Codex a real filesystem to explore — enabling deep, semantic understanding of how the app works, what is already built, and how the pieces connect. This goes significantly further than P3's GitHub MCP approach.

> **This is purely optional and experimental.** P0–P3 must be complete first. The PM tool works fully without P4. This exists for teams that need rich, deep codebase understanding beyond what file-by-file API reads can provide.

#### Why sandbox beats GitHub MCP for deep understanding

P3 (GitHub MCP) is good for targeted reads — fetch a file, search for a pattern, read a PR. But it has real limits for deep codebase understanding:

| Question | P3 GitHub MCP | P4 Sandbox + Claude Code |
|---|---|---|
| "What does this file do?" | Yes | Yes |
| "How do these 5 modules connect?" | Partial — manual file-by-file | Yes — agent traces imports and calls |
| "What is the full auth flow end-to-end?" | Hard — requires many API calls | Yes — agent explores interactively |
| "What features are fully built vs half-built?" | Slow and imprecise | Yes — agent grep/finds patterns holistically |
| "How does data flow from API to DB?" | Hard to stitch together | Yes — agent follows the chain |
| "What is the overall architecture?" | No — can't see the whole picture | Yes — agent reads the full tree |

The key difference: in P4, the full repo is cloned into a sandbox. Claude Code or Codex have a **real filesystem** — they can `grep`, `find`, trace imports, follow call chains, read all files at once, and build a complete mental model of the codebase. The agent is not limited to single-file reads via API.

#### What the agent does (and does not do)

**Allowed:**
- Clone the repo (read-only checkout)
- Read any file
- Run `grep`, `find`, `cat`, `ls`, `wc`, `tree` and other read-only shell commands
- Trace imports, follow function calls, map data flows
- Build a structured understanding of the codebase

**Not allowed (enforced via system prompt):**
- `git commit`, `git push`, `git add`
- Any file writes or edits
- Running the application, tests, or any executable code
- Installing packages or modifying the environment

The sandbox is used as an **isolated reading environment**, not an execution environment.

#### What this enables for the PM tool

- **"How does the app work?"** — Agent explores the full codebase and returns a plain-English architecture summary: key modules, data models, API routes, auth flow, etc.
- **"What is already built?"** — Agent maps features to code. "The payments module exists with Stripe integration, but webhook handling is a stub."
- **"What is half-built or missing?"** — Agent finds TODOs, empty handlers, unimplemented interfaces, feature flags that are always off.
- **"How does X work end-to-end?"** — Agent traces a full user journey through the code: request → middleware → handler → service → database.
- **"Is this feature safe to ship?"** — Agent looks for missing validation, error handling gaps, and hardcoded values in the relevant module.

These are PM questions that need the full picture — not answers a single file read can give.

**Tasks:**

1. **Restore Vercel Sandbox (behind a feature flag)**
   - Re-add `SANDBOX_VERCEL_TOKEN`, `SANDBOX_VERCEL_TEAM_ID`, `SANDBOX_VERCEL_PROJECT_ID` as optional env vars
   - If vars are not set, P4 mode is silently unavailable — no errors, no UI shown
   - Add a `Deep Analysis` option to project settings, visible only when sandbox is configured

2. **Read-Only Sandbox Prompt (strict)**
   - System prompt prefix for all P4 agent calls:
     ```
     You are a read-only codebase analyst. Your job is to deeply understand this codebase and answer questions about it.
     You may read files, run grep/find/cat/ls/tree, and trace code paths.
     You must NEVER write, edit, or delete files.
     You must NEVER run git commit, git push, or git add.
     You must NEVER run the application, execute tests, or install packages.
     You must NEVER modify the environment in any way.
     Only read. Only understand. Only report.
     ```
   - Supported agents: Claude Code (Anthropic), Codex (OpenAI) — configurable per project

3. **Predefined Understanding Queries**
   - PM selects from a menu of analysis queries rather than freeform input:
     - "Give me an architecture overview of this codebase"
     - "What features are fully built?"
     - "What is incomplete or stubbed out?"
     - "Walk me through the [auth / payments / data / API] flow end-to-end"
     - "What are the main data models and how do they relate?"
     - "What does the [module name] module do?"
   - Freeform custom questions available as an advanced option

4. **Structured Output Format**
   - Agent returns findings in a consistent structure:
     - **Architecture summary**: key modules, their roles, how they connect
     - **Built features**: what exists and appears complete
     - **Incomplete areas**: stubs, TODOs, empty handlers, half-built flows
     - **Risk flags**: missing validation, hardcoded values, obvious gaps
     - **Confidence**: low / medium / high based on code clarity
   - Stored in `codeInsights` table with `source: sandbox`, repo SHA, and query type

5. **Diffing Against Work Items**
   - Cross-reference agent findings with work items
   - "Work item says Done — agent found no corresponding implementation" → flag
   - "Agent found a fully-built feature that has no work item" → suggest creating one

6. **Sandbox Lifecycle (simplified)**
   - No Keep Alive — sandbox shuts down as soon as analysis is returned
   - Fixed 20-minute timeout — deep reads should complete well within this
   - No user-configurable duration — this is not a coding sandbox

7. **Caching**
   - Results cached by repo SHA — if the repo hasn't changed since last analysis, return cached results instantly
   - User can force a refresh
   - Cache stored in `codeInsights` alongside P3 results, distinguished by `source` field

**Exit criteria:** A PM can ask "how does this app work?" or "what is actually built?" and receive a rich, accurate, agent-generated answer based on a full codebase read — not just file-by-file API lookups.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Next.js 15 App                    │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │
│  │ Projects │  │  Work    │  │     Signals        │ │
│  │ Dashboard│  │  Items   │  │     Dashboard      │ │
│  └──────────┘  └──────────┘  └───────────────────┘ │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │           AI Layer (AI SDK 5)               │   │
│  │  Summaries │ Recommendations │ PRD Writing  │   │
│  │  Code Analysis (Mode B — read-only via MCP) │   │
│  └─────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────┘
                           │
          ┌────────────────┼──────────────────────┐
          │                │                      │
   ┌──────▼──────┐  ┌──────▼───────────┐  ┌──────▼──────────────┐
   │  Postgres   │  │   MCP Servers    │  │  GitHub API         │
   │  (Neon)     │  │   Linear         │  │  (Mode B fallback)  │
   │  projects   │  │   Notion         │  │  File contents      │
   │  workItems  │  │   Slack          │  │  injected as        │
   │  signals    │  │   GitHub MCP ◄───┼──┤  context for        │
   │  insights   │  │   (Mode B        │  │  targeted queries   │
   │  codeInsights│  │    primary)      │  └─────────────────────┘
   └─────────────┘  └──────────────────┘

Mode B data flow (no sandbox):
  Trigger → AI SDK 5 + GitHub MCP tools → agent browses repo via API
          → structured findings → cached in codeInsights → surfaced as signals
```

---

## Environment Variables

### Required (keep from template)
- `POSTGRES_URL` — PostgreSQL connection string
- `JWE_SECRET` — Session encryption secret (`openssl rand -base64 32`)
- `ENCRYPTION_KEY` — Data encryption key (`openssl rand -hex 32`)
- `NEXT_PUBLIC_AUTH_PROVIDERS` — Comma-separated: `github`, `vercel`, or both

### Authentication (at least one required)
- `NEXT_PUBLIC_GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`
- `NEXT_PUBLIC_VERCEL_CLIENT_ID` + `VERCEL_CLIENT_SECRET`

### AI (optional, can be per-user)
- `ANTHROPIC_API_KEY` — For Claude-based AI features
- `AI_GATEWAY_API_KEY` — For Vercel AI Gateway routing
- `OPENAI_API_KEY` — For Codex and OpenAI-based features

### Remove (no longer needed)
- ~~`SANDBOX_VERCEL_TOKEN`~~ — Removed with sandbox
- ~~`SANDBOX_VERCEL_TEAM_ID`~~ — Removed with sandbox
- ~~`SANDBOX_VERCEL_PROJECT_ID`~~ — Removed with sandbox
- ~~`MAX_SANDBOX_DURATION`~~ — Removed with sandbox

---

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS, shadcn/ui
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **AI**: AI SDK 5 + Vercel AI Gateway (Anthropic, OpenAI)
- **Auth**: NextAuth with GitHub and Vercel OAuth
- **Integrations**: MCP servers (Linear, Notion, Slack, GitHub)
- **Code Analysis (Mode B)**: Claude, OpenAI — read-only via GitHub MCP + GitHub API (no sandbox)

---

## Local Development

```bash
git clone <your-repository-url>
cd beacon
pnpm install

# Copy and fill in environment variables
cp .env.example .env.local

# Set up database
pnpm db:push

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Database commands
```bash
pnpm db:generate   # Generate migrations
pnpm db:push       # Push schema changes
pnpm db:studio     # Open Drizzle Studio
```

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Follow the priority order: P0 → P1 → P2 → P3
4. Do not implement P1+ features before P0 is complete
5. Test thoroughly
6. Submit a pull request
