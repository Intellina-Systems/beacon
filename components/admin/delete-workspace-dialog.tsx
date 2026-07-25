'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export function DeleteWorkspaceDialog({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [busy, setBusy] = useState(false)

  async function remove() {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/workspaces/${workspaceId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName }),
      })
      if (res.ok) {
        toast.success(`Deleted "${workspaceName}"`)
        router.push('/admin/workspaces')
        router.refresh()
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        toast.error(body?.error ?? 'Failed to delete workspace')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Delete workspace
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setConfirmName('')
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{workspaceName}&rdquo;</DialogTitle>
            <DialogDescription>
              This permanently deletes the workspace and everything in it — projects, work items, members, teams, docs,
              everything. There is no undo. Type <span className="font-medium text-foreground">{workspaceName}</span> to
              confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={workspaceName}
            autoComplete="off"
          />
          <Button variant="destructive" disabled={confirmName !== workspaceName || busy} onClick={remove}>
            {busy ? 'Deleting…' : 'Permanently delete'}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
