import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { projects, workItems } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

const PRIORITY_LABELS: Record<number, { label: string; className: string }> = {
  0: { label: 'No priority', className: 'text-muted-foreground' },
  1: { label: 'Urgent', className: 'text-red-600 dark:text-red-400' },
  2: { label: 'High', className: 'text-orange-600 dark:text-orange-400' },
  3: { label: 'Medium', className: 'text-yellow-600 dark:text-yellow-400' },
  4: { label: 'Low', className: 'text-blue-600 dark:text-blue-400' },
}

const STATUS_TYPE_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  started: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  unstarted: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  backlog: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  triage: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession()
  if (!session?.user) {
    redirect('/')
  }

  const { id } = await params

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, session.user.id)))
    .limit(1)

  if (!project) {
    notFound()
  }

  const items = await db
    .select()
    .from(workItems)
    .where(eq(workItems.projectId, id))
    .orderBy(workItems.priority, workItems.updatedAt)

  // Group by status type for summary
  const completedCount = items.filter((i) => i.statusType === 'completed').length
  const inProgressCount = items.filter((i) => i.statusType === 'started').length
  const openCount = items.filter((i) => !['completed', 'cancelled'].includes(i.statusType ?? '')).length

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Back nav */}
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/projects">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Projects
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        {project.description && <p className="text-muted-foreground mt-1">{project.description}</p>}
        <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
          <span>{items.length} issues</span>
          <span>{inProgressCount} in progress</span>
          <span>{completedCount} completed</span>
        </div>
      </div>

      {/* Work items table */}
      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No work items yet. Sync from Linear to import issues.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Title</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-32">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-24">Priority</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-32">Assignee</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => {
                const priority = PRIORITY_LABELS[item.priority ?? 0]
                const statusClass = STATUS_TYPE_COLORS[item.statusType ?? 'unstarted'] ?? STATUS_TYPE_COLORS.unstarted
                return (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium">{item.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-medium', statusClass)}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('text-xs font-medium', priority?.className)}>{priority?.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-muted-foreground">{item.assigneeName ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {item.linearUrl && (
                        <a
                          href={item.linearUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
