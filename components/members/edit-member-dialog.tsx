'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
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
}: {
  memberId: string
  name: string
  email: string | null
  title: string | null
  accessRole?: 'admin' | 'manager' | 'engineer'
  showAccessRole?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !nameVal.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
