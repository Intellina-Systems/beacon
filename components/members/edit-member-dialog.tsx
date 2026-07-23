'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function EditMemberDialog({
  memberId,
  name,
  email,
  title,
  accessRole,
  showAccessRole = false,
  isSelf = false,
}: {
  memberId: string
  name: string
  email: string | null
  title: string | null
  accessRole?: 'admin' | 'manager' | 'engineer'
  showAccessRole?: boolean
  isSelf?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [nameVal, setNameVal] = useState(name)
  const [emailVal, setEmailVal] = useState(email ?? '')
  const [titleVal, setTitleVal] = useState(title ?? '')
  const [roleVal, setRoleVal] = useState(accessRole ?? 'engineer')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameVal.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameVal,
          email: emailVal || null,
          title: titleVal || null,
          ...(showAccessRole ? { accessRole: roleVal } : {}),
        }),
      })
      if (res.ok) {
        setOpen(false)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        `Remove ${name} from the workspace? Their past activity and history stay attributed to them, but they'll lose access and any assignments are cleared. This can't be undone.`,
      )
    ) {
      return
    }
    setDeleting(true)
    try {
      const res = await fetch(`/api/members/${memberId}`, { method: 'DELETE' })
      if (res.ok) {
        setOpen(false)
        router.push('/team')
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Failed to remove member')
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5 mr-1.5" />
        Edit profile
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" value={nameVal} onChange={(e) => setNameVal(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={emailVal}
                onChange={(e) => setEmailVal(e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={titleVal}
                onChange={(e) => setTitleVal(e.target.value)}
                placeholder="Engineer, Designer, PM…"
              />
            </div>
            {showAccessRole && (
              <div className="space-y-2">
                <Label>Access role</Label>
                <Select value={roleVal} onValueChange={(value) => setRoleVal(value as typeof roleVal)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="engineer">Engineer</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
              {isSelf ? (
                <span />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={deleting}
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  {deleting ? 'Removing…' : 'Remove from workspace'}
                </Button>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !nameVal.trim()}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
