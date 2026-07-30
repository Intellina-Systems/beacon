import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type {
  ActivityEvent,
  AttachmentEntry,
  CommentEntry,
  ItemDetail,
  RelationsView,
  RosterOption,
  WatcherEntry,
} from '@/lib/work-items/types'
import type { WorkItemRelationType } from '@/lib/db/schema'

/**
 * Everything the work item page reads and writes. The page owns no fetching of
 * its own; when a mutation lands here it re-reads whatever it invalidated and
 * calls `router.refresh()` so the surrounding server-rendered lists agree.
 */
export function useWorkItemDetail(itemId: string, currentMemberId: string, onDeleted: () => void) {
  const router = useRouter()
  const [item, setItem] = useState<ItemDetail | null>(null)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [relations, setRelations] = useState<RelationsView | null>(null)
  const [watchers, setWatchers] = useState<WatcherEntry[]>([])
  const [comments, setComments] = useState<CommentEntry[]>([])
  const [attachments, setAttachments] = useState<AttachmentEntry[]>([])
  const [engineOptions, setEngineOptions] = useState<RosterOption[]>([])
  const [teamOptions, setTeamOptions] = useState<RosterOption[]>([])
  const [projectOptions, setProjectOptions] = useState<RosterOption[]>([])
  const [loading, setLoading] = useState(true)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [labelsDraft, setLabelsDraft] = useState('')

  const loadComments = useCallback(async () => {
    const res = await fetch(`/api/work-items/${itemId}/comments`)
    if (res.ok) setComments((await res.json()).comments ?? [])
  }, [itemId])

  const loadAttachments = useCallback(async () => {
    const res = await fetch(`/api/work-items/${itemId}/attachments`)
    if (res.ok) setAttachments((await res.json()).attachments ?? [])
  }, [itemId])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [itemRes, relationsRes, watchersRes, commentsRes, attachmentsRes, engineRes, teamRes, projectRes] =
        await Promise.all([
          fetch(`/api/work-items/${itemId}`),
          fetch(`/api/work-items/${itemId}/relations`),
          fetch(`/api/work-items/${itemId}/watchers`),
          fetch(`/api/work-items/${itemId}/comments`),
          fetch(`/api/work-items/${itemId}/attachments`),
          fetch('/api/engines'),
          fetch('/api/teams'),
          fetch('/api/projects'),
        ])
      if (!itemRes.ok) {
        toast.error('Failed to load work item')
        return
      }
      const itemData = await itemRes.json()
      const relationsData = await relationsRes.json().catch(() => ({}))
      const watchersData = await watchersRes.json().catch(() => ({}))
      const commentsData = await commentsRes.json().catch(() => ({}))
      const attachmentsData = await attachmentsRes.json().catch(() => ({}))
      const engineData = await engineRes.json().catch(() => ({}))
      const teamData = await teamRes.json().catch(() => ({}))
      const projectData = await projectRes.json().catch(() => ({}))
      setItem(itemData.item)
      setEvents(itemData.events ?? [])
      setDescriptionDraft(itemData.item.description ?? '')
      setLabelsDraft((itemData.item.labels ?? []).join(', '))
      setRelations(relationsData.relations ?? null)
      setWatchers(watchersData.watchers ?? [])
      setComments(commentsData.comments ?? [])
      setAttachments(attachmentsData.attachments ?? [])
      setEngineOptions(
        (engineData.engines ?? []).map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })),
      )
      setTeamOptions((teamData.teams ?? []).map((f: { id: string; name: string }) => ({ id: f.id, name: f.name })))
      setProjectOptions(
        (projectData.projects ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
      )
    } finally {
      setLoading(false)
    }
  }, [itemId])

  useEffect(() => {
    load()
  }, [load])

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/work-items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const data = await res.json()
      setItem(data.item)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Failed to update work item')
    }
  }

  async function triage(body: Record<string, unknown>) {
    const res = await fetch(`/api/work-items/${itemId}/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const data = await res.json()
      setItem(data.item)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Triage action failed')
    }
  }

  async function addRelation(relatedItemId: string, type: WorkItemRelationType) {
    const res = await fetch(`/api/work-items/${itemId}/relations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relatedItemId, type }),
    })
    if (res.ok) {
      toast.success(type === 'duplicate' ? 'Marked as duplicate' : 'Relation added')
      load()
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Failed to add relation')
    }
  }

  async function removeRelation(relationId: string) {
    const res = await fetch(`/api/work-items/${itemId}/relations/${relationId}`, { method: 'DELETE' })
    if (res.ok) {
      load()
      router.refresh()
    } else {
      toast.error('Failed to remove relation')
    }
  }

  async function toggleWatch(watching: boolean) {
    const res = watching
      ? await fetch(`/api/work-items/${itemId}/watchers?memberId=${currentMemberId}`, { method: 'DELETE' })
      : await fetch(`/api/work-items/${itemId}/watchers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
    if (res.ok) load()
  }

  async function addWatcher(memberId: string) {
    if (!memberId) return
    const res = await fetch(`/api/work-items/${itemId}/watchers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId }),
    })
    if (res.ok) {
      load()
    } else {
      toast.error('Failed to add watcher')
    }
  }

  async function removeWatcherEntry(memberId: string) {
    const res = await fetch(`/api/work-items/${itemId}/watchers?memberId=${memberId}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  async function postComment(body: string): Promise<boolean> {
    const res = await fetch(`/api/work-items/${itemId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Failed to post comment')
      return false
    }
    const data = await res.json()
    setComments(data.comments ?? [])
    // A comment emits task.commented, which subscribes the author and lands in
    // watchers' inboxes — reload both so the rail reflects it immediately.
    load()
    router.refresh()
    return true
  }

  async function editComment(commentId: string, body: string): Promise<boolean> {
    const res = await fetch(`/api/work-items/${itemId}/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Failed to save comment')
      return false
    }
    await loadComments()
    return true
  }

  async function removeComment(commentId: string) {
    const res = await fetch(`/api/work-items/${itemId}/comments/${commentId}`, { method: 'DELETE' })
    if (res.ok) {
      await loadComments()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Failed to delete comment')
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/work-items/${itemId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Work item deleted')
      onDeleted()
      router.refresh()
    } else {
      toast.error('Failed to delete work item')
    }
  }

  return {
    item,
    setItem,
    events,
    relations,
    watchers,
    comments,
    attachments,
    engineOptions,
    teamOptions,
    projectOptions,
    loading,
    descriptionDraft,
    setDescriptionDraft,
    labelsDraft,
    setLabelsDraft,
    load,
    loadAttachments,
    patch,
    triage,
    addRelation,
    removeRelation,
    toggleWatch,
    addWatcher,
    removeWatcherEntry,
    postComment,
    editComment,
    removeComment,
    handleDelete,
  }
}
