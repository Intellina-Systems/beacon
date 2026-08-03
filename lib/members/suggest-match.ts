const MATCH_THRESHOLD = 0.6

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Small strings only (identity labels) — no need for anything beyond
// classic O(n*m) Levenshtein.
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = temp
    }
  }
  return dp[n]
}

function similarity(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  // "Karthik Rao" vs "karthikrao78" — one contains the other once spaces and
  // case are stripped. Common enough (display name vs. login) to deserve its
  // own high-confidence band rather than falling through to edit distance.
  if (na.includes(nb) || nb.includes(na)) return 0.85
  const distance = levenshtein(na, nb)
  return 1 - distance / Math.max(na.length, nb.length)
}

export interface MatchCandidate {
  id: string
  name: string
  githubUsername: string | null
  aliases: string[] | null
}

export interface MatchSuggestion<T extends MatchCandidate> {
  member: T
  score: number
}

// Suggest the most likely roster member for an unresolved actor label.
// Purely advisory — never applied automatically. A human always confirms via
// the "Unmatched identities" admin table, which is what actually links the
// identity (lib/members/link-actor.ts).
export function suggestMemberMatch<T extends MatchCandidate>(label: string, roster: T[]): MatchSuggestion<T> | null {
  let best: MatchSuggestion<T> | null = null
  for (const member of roster) {
    const candidates = [member.name, member.githubUsername, ...(member.aliases ?? [])].filter((v): v is string =>
      Boolean(v),
    )
    for (const candidate of candidates) {
      const score = similarity(label, candidate)
      if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
        best = { member, score }
      }
    }
  }
  return best
}
