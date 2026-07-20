# Beacon Companion — Browser Extension Plan

> Added 2026-07-17. Companion to [SYNTHESIS.md](SYNTHESIS.md) (tracked there as **Track E**). Goal: a Chrome/Edge (MV3) extension that turns AI-chat work sessions — ChatGPT, Claude, Gemini, DeepSeek — into structured Beacon events, exactly like the `beacon-insights` agent skill does for coding agents, but for humans working in the browser.

---

## 1. Concept

Employees install one extension. When they're on a supported AI chat site **and have Work Mode on**, the extension:

1. **Detects the provider** (ChatGPT, Claude, Gemini, DeepSeek) via per-site adapters.
2. **Injects company context** — the workspace's standing instructions (coding standards, project glossary, "reference work items by key like BEA-123") into the conversation, on demand or on new-chat start.
3. **Captures progress** — with the user's full knowledge — as structured summaries of what was worked on, not raw transcripts.
4. **Sends structured events** to `POST /api/events` with a `bcn_` API key (same pipeline, same taxonomy as the beacon-insights skill).
5. **Adds UI**: a small panel with Project picker, Work Item picker (`BEA-123`), status update buttons, and a "Log this session to Beacon" action.

Result: "what did the team work on with AI today" shows up in Pulse/Timeline next to commits, PRs, and agent sessions — without anyone writing a status update.

## 2. Privacy model (load-bearing, not optional)

The work/personal split is the make-or-break feature. Hard rules, enforced in code and visible in UI:

- **Off by default.** Work Mode is an explicit per-site, per-session opt-in. Nothing is read, stored, or sent while it's off — the content script stays dormant.
- **Always-visible state.** A persistent badge/indicator on the page whenever Work Mode is active. No silent capture, ever.
- **Summaries, not transcripts.** Default payload is a structured summary (task, status, blockers, outcome). Sending full conversation text is a separate per-event opt-in, never a default.
- **Review before send.** The event payload is shown to the user for edit/confirm before it leaves the browser (an "auto-send after N sessions of trust" setting can relax this later, per user choice).
- **Personal chats are invisible.** No heuristic sniffing of "is this work?" — the user decides by toggling. The extension never reads pages while dormant, and non-listed sites have no content script at all (host permissions limited to the four chat domains).
- **Auditability.** Everything sent is an `events` row the user can see in Beacon's Timeline (filter `source=extension`); deleting an API key kills the extension's access instantly.
- **Storage hygiene.** API key in `chrome.storage.local` (per-profile), never in page context; no third-party analytics in the extension.

## 3. Architecture (Manifest V3)

```
┌─ Content scripts (one adapter per provider) ──────────────┐
│  chatgpt.com · claude.ai · gemini.google.com · deepseek   │
│  - detect conversation container + composer               │
│  - render Beacon panel (shadow DOM, isolated styles)      │
│  - inject context into composer on demand                 │
│  - extract conversation text on "log session" (only then) │
└──────────────┬────────────────────────────────────────────┘
               │ chrome.runtime messages
┌─ Service worker (background) ─────────────────────────────┐
│  - holds API key, Work Mode state, cached work items      │
│  - talks to Beacon: POST /api/events, GET work items      │
│  - queues events offline, retries with backoff            │
└──────────────┬────────────────────────────────────────────┘
               │ HTTPS (Bearer bcn_…)
┌─ Beacon backend ──────────────────────────────────────────┐
│  POST /api/events  (exists — API-key auth already works)  │
│  GET  /api/work-items, /api/sources w/ key auth (needed)  │
│  Optional: POST /api/extension/summarize (server-side AI) │
└───────────────────────────────────────────────────────────┘
```

Key technical decisions:

- **Per-site adapters as data, not code.** Each provider adapter = a JSON config (selectors for composer, message list, send button) + a small shared engine. Chat UIs change constantly; MV3 forbids remote *code*, but selector *configs* can be fetched from Beacon and hot-updated without a store re-review. Ship known-good configs in the bundle as fallback.
- **Shadow-DOM panel** so provider CSS can't break Beacon UI and vice versa.
- **Summarization server-side, not in-extension.** The extension sends raw text (user-approved) to a Beacon endpoint that runs the same AI stack as chat (`/api/extension/summarize`) and returns the structured event draft for user confirmation. Keeps LLM keys out of the extension and lets the summary prompt evolve server-side.
- **Event mapping** reuses the existing taxonomy: `agent.session_started`, `agent.planning`, `agent.blocked` (reason from chat), `agent.completed`, plus `knowledge.added` when a session produces a reusable doc/decision. New `EVENT_SOURCES` value: `extension` (one-line schema change; or reuse `agent` to ship faster).
- **Correlation** identical to the skill: `task` = work-item key (user-picked from the panel or auto-detected `BEA-\d+` mention in the chat), `engineer` = member match via email/alias, `externalId` = hash(provider, conversation id, event type) for dedupe.

## 4. Backend work required (small)

1. **CORS/auth**: allow extension-origin requests on `/api/events` (already API-key authed; verify preflight passes for `chrome-extension://` origins — likely just needs headers).
2. **Read scopes for API keys**: `verifyApiKey` currently only guards event ingest. Add key-authed read access to work items (for the picker) — either widen `resolveUserId`-style auth on `GET /api/work-items` or add scoped keys (`events:write`, `work-items:read`) to the `api_keys` table.
3. **`/api/extension/summarize`** (Phase 2): text in → structured `RawEvent[]` draft out, using the existing AI SDK setup.
4. **Workspace context endpoint** (Phase 2): `GET /api/extension/context` returning the admin-authored injection prompt (a `settings` row per workspace: `extension_context_prompt`).
5. **Admin surface** (Phase 3): integrations page card — extension install link, workspace context prompt editor, org policy defaults (e.g., "summaries only" enforced workspace-wide).

## 5. Phasing

**E1 — MVP (manual, zero magic):** panel on the four sites; API-key pairing (paste key from Integrations page — same flow as agent setup); Work Mode toggle + indicator; work-item picker; buttons: session started / progress note / blocked (with reason) / completed; free-text summary typed by the user; review-and-send. *No transcript reading at all in E1 — the panel is pure structured input, which sidesteps most privacy and DOM-fragility risk on day one.*

**E2 — Assisted capture:** "Summarize this session" reads the conversation (on click only), sends to the summarize endpoint, returns a draft event for confirmation; context injection button ("Insert Beacon context"); auto-detect `BEA-123` mentions to pre-select the work item; remote adapter configs.

**E3 — Ambient & managed:** optional auto-prompt at natural boundaries ("log this session?" on tab close/new chat); admin-managed deployment (Chrome Enterprise policy force-install with pre-set Beacon URL); workspace policies (allowed sites, summaries-only enforcement); Firefox port; per-conversation "work project" memory so repeat sessions auto-tag.

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Chat UIs change, selectors break | Adapter configs as remotely-updatable data; E1 doesn't depend on page DOM at all |
| Provider ToS on scraping/automation | Capture is user-initiated, user-reviewed, and only of the user's own conversation content; no automated posting except explicit context-insert into the composer |
| Perceived surveillance kills adoption | Off-by-default, visible indicator, review-before-send, summaries-only default, user-visible audit trail — lead with these in the rollout comms |
| API key leakage from extension storage | Keys are per-user and revocable (`api_keys.revokedAt` exists); scope keys narrowly; consider short-lived tokens in E3 |
| MV3 service worker lifetime | Event queue persisted to `chrome.storage`; fire-and-forget with retry, same "never block the user's work" rule as the beacon-insights skill |

## 7. Explicit non-goals

- No background reading of chats while Work Mode is off (not "we discard it" — we never receive it).
- No keystroke capture, no screenshots, no browsing history.
- No auto-classification of personal vs work — that's a human toggle, permanently.
- No injecting content into conversations without an explicit user action.
