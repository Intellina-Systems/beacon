# Engineering Intelligence Layer (EIL)

## Vision

An AI-powered operating system for engineering teams that automatically collects signals from work, code, AI coding agents, CI/CD, and communication tools to provide real-time visibility, planning, and intelligent insights.

> Don't manage tasks. Understand engineering.

---

# Core Problems

| Problem | Solution |
|----------|----------|
| Team visibility | Real-time dashboards |
| Manual status updates | Automatic event collection |
| Planning | Roadmaps & capacity planning |
| Work assignment | Prioritized backlog |
| Knowledge sharing | Internal knowledge base |
| Keeping up with AI | Weekly AI research feed |
| Performance | Engineering intelligence |
| Blockers | AI detection & alerts |

---

# Architecture

```text
GitHub
Linear
CI/CD
Slack
Calendar
Documents
Meeting Notes
Coding Agents
        │
        ▼
Event Collectors / Plugins
        │
        ▼
Engineering Intelligence API
        │
        ▼
Event Store + Knowledge Graph
        │
        ▼
AI Intelligence Layer
        │
        ▼
Dashboards + Chat
```

---

# Event-Driven Model

Never store status.

Store events.

Examples:

- Task Started
- Planning
- Implementation Started
- Tests Failed
- Blocked
- Alternative Attempt
- Tests Passed
- PR Opened
- Review Requested
- Changes Requested
- Merged
- Deployment Completed

Everything else is derived.

---

# Coding Agent Plugin

Agents emit structured events.

```json
{
  "type": "task.started",
  "task": "AIRS-421",
  "engineer": "Nandu"
}
```

```json
{
  "type": "blocked",
  "reason": "API schema mismatch",
  "confidence": 0.92
}
```

```json
{
  "type": "tests.failed",
  "count": 14
}
```

---

# Signal Sources

- GitHub
- Linear / Jira
- CI/CD
- Slack / Discord
- Calendar
- Documentation
- Meeting Notes
- Claude Code
- Codex
- Custom AI Plugins

---

# Dashboards

## Executive

- Company goals
- Feature progress
- Risks
- Team health
- Capacity
- Delivery forecast

## Team

- Sprint progress
- Priorities
- Dependencies
- Blockers
- Workload

## Individual

- Today's work
- Assigned tasks
- Pending reviews
- Blockers
- Learning recommendations
- Achievements

---

# AI Chat

Examples:

- What is everyone working on?
- Who is blocked?
- What slipped this week?
- Which PRs need review?
- Which feature is behind?
- What should we prioritize next?
- What happened yesterday?
- What's new in AI this week?

---

# AI Research Feed

Automatically summarizes:

- React updates
- Next.js RFCs
- AI SDK updates
- Claude Code changes
- OpenAI releases
- Databricks updates
- Engineering best practices

---

# Performance Intelligence

Technical

- Delivery
- Review quality
- Review speed
- Bugs
- Documentation
- Architecture
- Ownership

Non-Technical

- Communication
- Mentoring
- Planning
- Responsiveness
- Collaboration

AI summarizes trends—not people.

---

# Principles

- Events over status
- Automatic over manual
- Context over activity
- Intelligence over dashboards
- Assist engineers, don't monitor them

---

# MVP Roadmap

## P0

- Work items (Epics → Features → Tasks)
- GitHub integration
- Event ingestion API
- Timeline view
- Executive dashboard

## P1

- CI/CD integration
- AI summaries
- Team dashboard
- Individual dashboard
- AI Chat

## P1.5 — shipped

- Workspace model (users = identities, workspaces own the data)
- Access roles: Admin / Manager / Engineer + per-team Lead flag
- Teams (cross-team membership, non-technical kind, no manager required)
- Projects (Workspace → Projects → Epics → Features → Tasks; sources map to projects)
- Link-based invites with admin-predefined role & team assignments

## P2

- Coding agent plugins
- Weekly digest
- Knowledge Graph
- Performance insights
- Capacity planning
- Predictive risk detection

## P3

- AI research feed
- Calendar integration
- Organization-wide intelligence

---

# End Goal

Build an **Engineering Intelligence Layer** that sits above GitHub, Linear, coding agents, CI/CD, and communication tools, continuously understanding what's happening across the engineering organization.

Instead of asking:

> "Can everyone give a status update?"

You simply ask:

> "What's happening?"

And the system already knows.
