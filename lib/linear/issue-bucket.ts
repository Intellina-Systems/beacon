export type IssueBucket = 'todo' | 'inProgress' | 'completed' | 'backlog'

export function getIssueBucket(statusType: string | null | undefined, status: string | null | undefined): IssueBucket {
  const type = statusType?.toLowerCase().trim() ?? ''
  const name = status?.toLowerCase().trim() ?? ''

  if (type === 'backlog' || type === 'triage' || name === 'backlog') return 'backlog'
  if (type === 'started' || name === 'in progress') return 'inProgress'
  if (type === 'completed' || type === 'cancelled' || type === 'canceled' || name === 'done' || name === 'completed') {
    return 'completed'
  }
  return 'todo'
}
