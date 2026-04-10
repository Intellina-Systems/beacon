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
- `JWE_SECRET`, `ENCRYPTION_KEY`
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
- Decrypted Linear/GitHub access tokens

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

### Project structure

```
app/
  api/
    auth/          # OAuth flows: GitHub, Vercel, Linear
    linear/        # Linear sync endpoints
    projects/      # Beacon project CRUD
    members/       # Team roster CRUD
  projects/        # Projects list and detail pages
  team/            # Team roster page
  page.tsx         # Landing / redirect to /projects

lib/
  db/
    schema.ts      # Drizzle schema: users, accounts, settings,
                   # linearConnections, projects, workItems, members
    client.ts      # Neon DB client
  linear/
    client.ts      # Linear GraphQL API client
  session/         # Session management (JWE cookies)
  crypto.ts        # AES-256-CBC encrypt/decrypt for stored tokens

components/
  beacon-layout.tsx   # App shell: sidebar nav (Projects, Team) + mobile header
  auth/               # SignIn, SignOut, User, SessionProvider
  ui/                 # shadcn primitives
```

### Database tables

| Table | Purpose |
|---|---|
| `users` | Auth: primary OAuth account per user |
| `accounts` | Auth: additional connected OAuth accounts (GitHub) |
| `settings` | Per-user key-value config |
| `linear_connections` | Encrypted Linear OAuth token per user |
| `projects` | Beacon projects, optionally linked to a Linear project |
| `work_items` | Issues synced from Linear per project |
| `members` | Team roster |

### Linear integration flow

1. `GET /api/auth/linear/signin` — initiates OAuth, sets state cookies
2. `GET /api/auth/linear/callback` — exchanges code, encrypts token, writes `linear_connections`
3. `POST /api/linear/sync` — fetches projects, issues, and users from Linear; upserts into DB

### Adding new features

- P1 adds signal ingestion (WhatsApp, email, docs → review queue → Linear issues)
- P2 adds intelligence layer (daily digest, gap detection, GitHub signals, web search)
- P3 adds market-aware roadmap suggestions
- P4 adds people layer and learning gap recommendations

Follow P0 → P1 → P2 → P3 → P4. Do not skip ahead.

---

## Compliance Checklist

Before submitting:

- [ ] No template literals with `${}` in log statements
- [ ] No sensitive data in API error responses
- [ ] `pnpm format` — no formatting changes
- [ ] `pnpm type-check` — zero errors
- [ ] `pnpm lint` — zero new errors
- [ ] `pnpm build` — successful production build
