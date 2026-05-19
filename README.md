# Beacon — AI-Powered Internal PM Tool

Beacon is an internal project management tool that bridges the gap between where your team actually works (WhatsApp, email, Google Sheets, client docs, raw text) and where work is tracked (Linear). It uses AI to extract structure from chaos, sync to Linear, surface what matters, and recommend what to build next — informed by both internal signals and what's happening in the world.

> **For AI agents working on this codebase:** This README is the source of truth for what to build and in what order. Follow P0 → P1 → P2 → P3 → P4 strictly. Do not skip ahead.

---

## Core Capabilities

1. **Plan** — AI decomposes goals into structured work items, pushed to Linear
2. **Assign** — Team roster with AI-inferred workload and skill fit
3. **Update tasks** — Status, priority, assignee, due date — synced with Linear
4. **Capture signals** — Ingest anything: WhatsApp dumps, emails, sheets, client docs, raw text
5. **Recommend next steps** — AI synthesizes all signals into prioritized action
6. **Suggest learning gaps** — AI infers skill gaps from task patterns, blockers, and market trends

---

## Three Signal Layers

```
EXTERNAL SIGNALS          INTERNAL SIGNALS           CODE SIGNALS
─────────────────         ────────────────           ────────────
Web search trends    ─┐   WhatsApp / Email     ─┐   GitHub repo    ─┐
Industry news        ─┤   Google Sheets        ─┤   PRs / commits  ─┤
Competitor moves     ─┤   Client requirements  ─┤   TODOs/gaps     ─┘
Market shifts        ─┘   Linear (sync)        ─┘
                     │                          │         │
                     └──────────┬───────────────┘         │
                                ▼                         │
                         AI synthesis engine ◄────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
             What to build next      What to fix now
             (market-driven)         (ops-driven)
```

### External signals — Web search

- Scheduled nightly pulls on configured topics per project (competitor names, industry keywords, stack terms, client verticals)
- On-demand: triggered manually or when a new client requirement is ingested
- Powers market-aware roadmap recommendations

### Internal signals — Unstructured ingestion

- Paste or upload anything: WhatsApp export, email thread, Google Sheets CSV, client requirement doc, meeting notes, raw text
- AI extracts: tasks, decisions, blockers, risks, client requirements
- Review queue → human approves → pushed to Linear

### Code signals — GitHub (read-only)

- Open PRs, open issues, stale reviews, commit activity
- AI identifies: incomplete features, risk areas, high-churn modules, TODO/FIXME density
- Surfaced alongside operational signals in the project dashboard

---

## Linear Integration

Linear is the source of truth for work items. Beacon reads from and writes to Linear — it does not replace it.

- **Read**: sync projects, issues, statuses, assignees, cycle data
- **Write**: create issues from extracted signals (with human review step before posting)
- **Map**: Beacon statuses map to Linear statuses — no duplicate state management

The review queue is the trust boundary. AI proposes, human approves, Beacon posts.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Next.js 15 App                      │
│                                                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐ │
│  │  Projects  │  │ Work Items │  │  Signals Dashboard │ │
│  └────────────┘  └────────────┘  └────────────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              AI Layer (AI SDK 5)                 │   │
│  │  Ingestion │ Extraction │ Recommendations        │   │
│  │  Roadmap suggestions │ Learning gap analysis     │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────┘
                         │
        ┌────────────────┼─────────────────────┐
        │                │                     │
 ┌──────▼──────┐  ┌──────▼──────────┐  ┌──────▼──────┐
 │  Postgres   │  │  Integrations   │  │  Web Search  │
 │  (Neon)     │  │                 │  │  (Tavily /   │
 │  projects   │  │  Linear API     │  │  Perplexity) │
 │  workItems  │  │  GitHub API     │  │              │
 │  members    │  │  GitHub MCP     │  │  Nightly     │
 │  signals    │  │  (code signals) │  │  + on-demand │
 │  insights   │  │                 │  └─────────────┘
 │  codeInsights│  └─────────────────┘
 └─────────────┘
```

---

## Database Schema

### Core tables

- `projects` — top-level container (name, description, repo URL, Linear project ID, client vertical, tracked topics for web search)
- `workItems` — synced from Linear (title, description, status, priority, assignee, projectId, linearId, source, sourceId)
- `members` — team roster (name, GitHub username, Linear user ID, role, inferred skills, current workload)
- `signals` — raw captured signals (type, content, source, metadata, projectId, createdAt)
  - `source`: `whatsapp` | `email` | `sheet` | `doc` | `text` | `github` | `web`
- `insights` — AI-processed findings (summary, recommendations, risks, projectId, generatedAt)
- `codeInsights` — cached GitHub/agent analysis (query, findings, repoPath, repoSHA, generatedAt, projectId, source)
- `reviewQueue` — pending AI-proposed Linear items awaiting human approval (proposed issue, extracted from signal, status: pending | approved | rejected)

---

## Feature Priorities

---

### P0 — Foundation ✅

Goal: Clean base with Linear connected. No ingestion yet.

1. ✅ Strip any remaining coding-agent or sandbox infrastructure from the template
2. ✅ Auth (GitHub OAuth, Vercel OAuth) — keep as-is
3. ✅ Linear OAuth + API integration — connect workspace, pull projects and issues
4. ✅ `projects`, `workItems`, `members` tables
5. ✅ Basic UI: project list, work item list (mirroring Linear), team roster
6. ✅ Ensure app builds and runs cleanly

**Exit criteria:** Users can sign in, see their Linear projects and issues in Beacon, and manage a team roster.

---

### P1 — Signal Ingestion

Goal: Accept unstructured input and turn it into structured Linear issues.

1. **Ingestion interface** — single paste/upload UI that accepts:
   - WhatsApp chat export (raw text)
   - Email thread (pasted body)
   - Google Sheets (CSV upload or paste)
   - Client requirement document (paste or file upload)
   - Free-form meeting notes or raw text
2. **AI extraction** — for each input, extract:
   - Tasks → candidates for Linear issues
   - Decisions → stored as signals
   - Blockers → linked to existing Linear items if match found
   - Risks → flagged in dashboard
   - Client requirements → mapped to existing or new Linear items
3. **Review queue** — extracted items shown for human approval before any Linear write
4. **Linear write** — approved items posted as issues via Linear API
5. **Signal storage** — all raw inputs and extracted data stored in `signals` table

**Exit criteria:** A PM can paste a WhatsApp conversation and have relevant Linear issues created after a one-click review step.

---

### P2 — Intelligence Layer

Goal: Beacon connects the dots and tells you what to pay attention to.

1. **Daily digest** — AI summary of signals captured since last digest, cross-referenced with Linear state
2. **Gap detection** — signals that reference something with no corresponding Linear issue
3. **Sprint readiness** — AI reads current cycle state + open signals → flags risks
4. **Recommendation engine** — prioritized list of what needs attention, with reasoning
5. **GitHub signal capture** — open PRs, stale reviews, issues with no PR, commit activity surfaced as signals
6. **Web search integration**
   - Configure topics per project: competitor names, industry keywords, client vertical, stack terms
   - Nightly scheduled pull via Vercel Cron → structured summaries stored as `web` signals
   - On-demand: triggered manually or when a new client requirement is ingested
   - AI connects external trends to internal signals and Linear backlog

**Exit criteria:** PM opens Beacon each morning and already knows what needs attention — informed by internal signals and what's happening externally.

---

### P3 — Market-Aware Roadmap

Goal: Beacon tells you what to build next, backed by data.

1. **Trend × demand scoring** — cross-reference external trends with client signal frequency and Linear backlog items
2. **Roadmap suggestions** — ranked recommendations with reasoning: "Build X because: client mentioned it 4x, 3 competitors shipped it this quarter, no Linear issue exists yet"
3. **Build vs. evaluate signals** — when planning a new feature, AI searches for existing OSS or SaaS solutions worth evaluating first
4. **Client industry intelligence** — per-project vertical tracking; flag regulatory or market changes relevant to a client
5. **Technology risk signals** — deprecations, CVEs, or ecosystem shifts affecting your stack

**Exit criteria:** A PM can ask "what should we build next quarter?" and get a ranked, evidence-backed answer.

---

### P4 — People Layer & Learning Gaps

Goal: Beacon builds a picture of each team member and surfaces skill gaps before they become blockers.

1. **Workload inference** — AI reads Linear assignments, signal extraction authorship, and PR activity to estimate per-member load
2. **Skill inference** — AI infers strengths and gaps from: task types owned, where blockers occur, which tasks run over, client feedback patterns
3. **Learning gap recommendations** — weekly output per member and per team:
   - "Two auth-related tasks are blocked and overdue — likely gap: OAuth / session handling"
   - "Your team has no coverage in X — which is becoming table stakes in your client's space"
4. **Market-calibrated gaps** — cross-reference inferred gaps with external trend signals: "The gap matters more because the market is moving this way"
5. **Team composition view** — who owns what, where coverage is thin, what the next hire or upskill should address

**Exit criteria:** Beacon surfaces a weekly "team health" view with specific, actionable learning recommendations — inferred entirely from work patterns and market signals.

---

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS, shadcn/ui
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **AI**: AI SDK 5 + Vercel AI Gateway (Anthropic Claude, OpenAI)
- **Auth**: NextAuth with GitHub and Vercel OAuth
- **Linear**: Linear API + OAuth (read + write)
- **Code signals**: GitHub API + GitHub MCP server (read-only)
- **Web search**: Tavily or Perplexity API (structured results for AI agents)
- **Scheduling**: Vercel Cron (nightly web search pulls, digest generation)

---

## Environment Variables

### Required

- `POSTGRES_URL` — PostgreSQL connection string
- `JWE_SECRET` — Session encryption (`openssl rand -base64 32`)
- `ENCRYPTION_KEY` — Data encryption (`openssl rand -hex 32`)
- `NEXT_PUBLIC_AUTH_PROVIDERS` — `github`, `vercel`, or both

### Authentication

- `NEXT_PUBLIC_GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`
- `NEXT_PUBLIC_VERCEL_CLIENT_ID` + `VERCEL_CLIENT_SECRET`

### Linear

- `LINEAR_CLIENT_ID` + `LINEAR_CLIENT_SECRET` — OAuth app credentials
- Per-user Linear tokens stored encrypted in DB after OAuth flow

### AI

- `ANTHROPIC_API_KEY` — Claude (primary)
- `OPENAI_API_KEY` — OpenAI fallback
- `AI_GATEWAY_API_KEY` — Vercel AI Gateway routing

### Web Search

- `TAVILY_API_KEY` or `PERPLEXITY_API_KEY`

---

## Local Development

```bash
git clone <your-repository-url>
cd beacon
pnpm install

cp .env.example .env.local
# Fill in env vars above

pnpm db:push
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Database commands

```bash
pnpm db:generate   # Generate migrations
pnpm db:push       # Push schema changes
pnpm db:studio     # Open Drizzle Studio
```


