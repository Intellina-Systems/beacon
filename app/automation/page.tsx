import { redirect } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { automationRules } from '@/lib/db/schema'
import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { canManageWorkspaceConfig } from '@/lib/auth/permissions'
import { PageShell, EmptyState } from '@/components/page-shell'
import { CreateRuleDialog } from '@/components/automation/create-rule-dialog'
import { RuleRowActions } from '@/components/automation/rule-row-actions'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Automation' }

function describeCondition(c: { field: string; op: string; value: unknown }): string {
  const field = c.field.replace('workItem.', '').replace('event.', '')
  const op = c.op === 'eq' ? 'is' : c.op === 'neq' ? 'is not' : c.op === 'in' ? 'in' : 'contains'
  const value = Array.isArray(c.value) ? c.value.join(', ') : String(c.value)
  return `${field} ${op} ${value}`
}

function describeAction(a: { type: string; value: unknown }): string {
  switch (a.type) {
    case 'set_status':
      return `set status to ${a.value}`
    case 'set_assignee':
      return a.value === 'trigger_actor'
        ? 'assign to whoever triggered it'
        : a.value
          ? `assign to ${a.value}`
          : 'unassign'
    case 'set_priority':
      return `set priority to ${a.value}`
    case 'add_label':
      return `add label "${a.value}"`
    case 'notify':
      return `notify ${a.value === 'assignee' ? 'the assignee' : a.value}`
    default:
      return String(a.type)
  }
}

export default async function AutomationPage() {
  const ctx = await getWorkspaceContext()
  if (!ctx) redirect('/')
  if (!canManageWorkspaceConfig(ctx)) redirect('/work')

  const rules = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.workspaceId, ctx.workspaceId))
    .orderBy(asc(automationRules.name))

  return (
    <PageShell
      title="Automation"
      description="Trigger → condition → action rules evaluated on every event"
      actions={<CreateRuleDialog />}
    >
      <div className="mx-auto w-full max-w-4xl px-4 py-5 lg:px-6">
        {rules.length === 0 ? (
          <div className="flex rounded-lg border border-dashed">
            <EmptyState
              title="No rules yet"
              hint='Create one to react to events automatically — e.g. "when a task is blocked, notify the assignee."'
            />
          </div>
        ) : (
          <div className="divide-y overflow-hidden rounded-lg border bg-card">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{rule.name}</p>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {rule.triggerEventType}
                    </Badge>
                    {!rule.enabled && (
                      <Badge variant="secondary" className="text-[10px]">
                        Disabled
                      </Badge>
                    )}
                  </div>
                  {rule.conditions && rule.conditions.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      If {rule.conditions.map(describeCondition).join(' and ')}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Then {rule.actions.map(describeAction).join('; ')}
                  </p>
                </div>
                <RuleRowActions ruleId={rule.id} enabled={rule.enabled} />
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}
