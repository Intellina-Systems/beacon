// Lets a user pick how much technical depth Beacon's chat responses carry.
// Shared between the client (UI + localStorage) and the /api/chat route
// (system prompt instructions), so the two never drift out of sync.

export const RESPONSE_LEVELS = ['plain', 'balanced', 'technical'] as const

export type ResponseLevel = (typeof RESPONSE_LEVELS)[number]

export const DEFAULT_RESPONSE_LEVEL: ResponseLevel = 'plain'

export const RESPONSE_LEVEL_LABELS: Record<ResponseLevel, string> = {
  plain: 'Plain-language',
  balanced: 'Balanced',
  technical: 'In-depth',
}

export const RESPONSE_LEVEL_DESCRIPTIONS: Record<ResponseLevel, string> = {
  plain: 'Clear takeaways, no jargon',
  balanced: 'A mix of summary and detail',
  technical: 'Full technical detail',
}

export const RESPONSE_LEVEL_INSTRUCTIONS: Record<ResponseLevel, string> = {
  plain:
    'Respond in plain, everyday English, written for someone who has never written code. Describe what happened and what it means, never how it was built. Never include PR numbers, ticket/issue IDs, commit hashes, branch names, file paths, or any other identifier or code — refer to work by its plain description instead (e.g. "the login fix" rather than "PR #482" or "a1b2c3d"). Avoid digits entirely: spell out counts in words or use qualitative terms ("a few", "most of the team", "several") rather than exact numbers, and describe timing in everyday terms ("earlier this week", "yesterday") rather than dates or timestamps. Avoid jargon and acronyms; if a technical concept is unavoidable, explain it in one plain phrase.',
  balanced:
    'Respond with a moderate level of detail: clear and to the point, naming specific items (PRs, tickets, services) where relevant, without going deeper into implementation than the question calls for.',
  technical:
    'Respond with full technical depth: use precise engineering terminology, and reference specific files, functions, services, or error messages when you have them. Do not simplify or over-explain basic terms.',
}

export function isResponseLevel(value: unknown): value is ResponseLevel {
  return typeof value === 'string' && (RESPONSE_LEVELS as readonly string[]).includes(value)
}
