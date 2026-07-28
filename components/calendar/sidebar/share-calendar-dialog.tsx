import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ShareCalendarDialog({
  open,
  onOpenChange,
  email,
  onEmailChange,
  sharing,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  email: string
  onEmailChange: (value: string) => void
  sharing: boolean
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Share calendar</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="share-email">Teammate email</Label>
          <Input
            id="share-email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
            placeholder="teammate@company.com"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={sharing || !email.trim()}>
            {sharing ? 'Sharing…' : 'Share'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
