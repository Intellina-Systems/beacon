import type { WorkItemStatus } from '@/lib/db/schema'

export interface RosterOption {
  id: string
  name: string
}

export interface ProjectOption {
  id: string
  name: string
}

export interface WorkItemRow {
  id: string
  kind: 'epic' | 'feature' | 'task'
  key: string | null
  title: string
  status: WorkItemStatus
  priority: number | null
  projectId: string
  assigneeMemberId?: string | null
  assigneeName: string | null
  projectName: string | null
  engineName?: string | null
  teamName?: string | null
  externalUrl: string | null
  lastEventAt: string | Date | null
  updatedAt: string | Date | null
}

export interface ActivityEvent {
  id: string
  type: string
  summary: string
  source: string
  actorLabel: string | null
  memberName: string | null
  occurredAt: string
  // Already selected by lib/events/queries.ts's listEvents — declared here so
  // consumers like WorkItemGitActivity can read PR/commit details (number,
  // url, closing…) without a second fetch.
  payload: Record<string, unknown> | null
}

export interface ItemDetail {
  id: string
  key: string | null
  title: string
  description: string | null
  kind: 'epic' | 'feature' | 'task'
  status: WorkItemStatus
  priority: number | null
  assigneeMemberId: string | null
  labels: string[] | null
  dueDate: string | null
  estimate: number | null
  snoozedUntil: string | null
  externalUrl: string | null
  projectId: string
  engineId: string | null
  teamId: string | null
}

export interface RelationEntry {
  relationId: string
  item: { id: string; key: string | null; title: string; status: WorkItemStatus }
}

export interface RelationsView {
  blocks: RelationEntry[]
  blockedBy: RelationEntry[]
  duplicateOf: RelationEntry | null
  duplicates: RelationEntry[]
  related: RelationEntry[]
}

export interface WatcherEntry {
  memberId: string
  reason: string
  name: string
}

export interface CommentEntry {
  id: string
  body: string
  authorMemberId: string | null
  authorName: string | null
  authorAvatarUrl: string | null
  createdAt: string
  editedAt: string | null
}

export interface AttachmentEntry {
  id: string
  filename: string
  contentType: string
  size: number
  url: string
  commentId: string | null
  uploadedByMemberId: string | null
  createdAt: string
}
