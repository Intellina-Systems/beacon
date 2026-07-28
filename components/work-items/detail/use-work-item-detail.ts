import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { ActivityEvent, ItemDetail, RelationsView, RosterOption, WatcherEntry } from '@/lib/work-items/types'
import type { WorkItemRelationType } from '@/lib/db/schema'

export function useWorkItemDetail(itemId: string | null, open: boolean, currentMemberId: string, onClose: () => void) {
  const router = useRouter()
  const [item, setItem] = useState<ItemDetail | null>(null)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [relations, setRelations] = useState<RelationsView | null>(null)
  const [watchers, setWatchers] = useState<WatcherEntry[]>([])
  const [engineOptions, setEngineOptions] = useState<RosterOption[]>([])
  const [teamOptions, setTeamOptions] = useState<RosterOption[]>([])
  const [projectOptions, setProjectOptions] = useState<RosterOption[]>([])
  const [loading, setLoading] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [labelsDraft, setLabelsDraft] = useState('')

  const load = useCallback(async () => {
    if (!itemId) return
    setLoading(true)
    try {
      const [itemRes, relationsRes, watchersRes, engineRes, teamRes, projectRes] = await Promise.all([
        fetch(`/api/work-items/${itemId}`),
        fetch(`/api/work-items/${itemId}/relations`),
        fetch(`/api/work-items/${itemId}/watchers`),
        fetch('/api/engines'),
        fetch('/api/teams'),
        fetch('/api/projects'),
      ])
      if (!itemRes.ok) {
        toast.error('Failed to load work item')
        onClose()
        return
      }
      const itemData = await itemRes.json()
      const relationsData = await relationsRes.json()
      const watchersData = await watchersRes.json()
      const engineData = await engineRes.json().catch(() => ({}))
      const teamData = await teamRes.json().catch(() => ({}))
      const projectData = await projectRes.json().catch(() => ({}))
      setItem(itemData.item)
      setEvents(itemData.events ?? [])
      setDescriptionDraft(itemData.item.description ?? '')
      setLabelsDraft((itemData.item.labels ?? []).join(', '))
      setRelations(relationsData.relations)
      setWatchers(watchersData.watchers ?? [])
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId])

  useEffect(() => {
    if (open && itemId) load()
    if (!open) {
      setItem(null)
      setEvents([])
      setRelations(null)
      setWatchers([])
    }
  }, [open, itemId, load])

  async function patch(body: Record<string, unknown>) {
    if (!itemId) return
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
    if (!itemId) return
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
    if (!itemId) return
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
    if (!itemId) return
    const res = await fetch(`/api/work-items/${itemId}/relations/${relationId}`, { method: 'DELETE' })
    if (res.ok) {
      load()
      router.refresh()
    } else {
      toast.error('Failed to remove relation')
    }
  }

  async function toggleWatch(watching: boolean) {
    if (!itemId) return
    if (watching) {
      const res = await fetch(`/api/work-items/${itemId}/watchers?memberId=${currentMemberId}`, { method: 'DELETE' })
      if (res.ok) load()
    } else {
      const res = await fetch(`/api/work-items/${itemId}/watchers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) load()
    }
  }

  async function addWatcher(memberId: string) {
    if (!itemId || !memberId) return
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
    if (!itemId) return
    const res = await fetch(`/api/work-items/${itemId}/watchers?memberId=${memberId}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  async function handleDelete() {
    if (!itemId) return
    const res = await fetch(`/api/work-items/${itemId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Work item deleted')
      onClose()
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
    engineOptions,
    teamOptions,
    projectOptions,
    loading,
    descriptionDraft,
    setDescriptionDraft,
    labelsDraft,
    setLabelsDraft,
    load,
    patch,
    triage,
    addRelation,
    removeRelation,
    toggleWatch,
    addWatcher,
    removeWatcherEntry,
    handleDelete,
  }
}
