import {
  TeamDisplay,
  WorkItemsDisplay,
  BlockersDisplay,
  UnknownToolDisplay,
  ToolLoading,
} from '@/components/chat/tool-renderers'
import {
  WriteConfirmationCard,
  WriteCancelledNote,
  WriteAppliedChip,
  ToolErrorNote,
} from '@/components/chat/write-confirmation-card'
import { isChatWriteToolName } from '@/lib/chat/tool-names'
import { resolveToolName, type AnyPart } from '@/lib/chat/tool-parts'

export function ToolPartRenderer({
  part,
  onRespondToApproval,
}: {
  part: AnyPart
  onRespondToApproval?: (id: string, approved: boolean) => void
}) {
  const toolName = resolveToolName(part)

  if (part.state === 'input-streaming') {
    return <ToolLoading label={`Running ${toolName}…`} />
  }

  if (part.state === 'approval-requested' && part.approval) {
    return (
      <WriteConfirmationCard
        toolName={toolName}
        input={part.input}
        approvalId={part.approval.id}
        onRespond={onRespondToApproval}
      />
    )
  }

  if (part.state === 'output-denied' || (part.state === 'approval-responded' && part.approval?.approved === false)) {
    return <WriteCancelledNote />
  }

  // Between clicking Confirm and the auto-resend actually landing a real
  // output, the part sits in 'approval-responded' with approved: true — a
  // real, if brief, state with no output yet. Without this branch it fell
  // through everything below to the raw-JSON fallback for that whole window,
  // which reads as broken if the resend is at all slow.
  if (part.state === 'approval-responded' && part.approval?.approved === true) {
    return <ToolLoading label={`Applying ${toolName}…`} />
  }

  // A real exception thrown inside a tool's execute() (a DB error, an
  // unhandled edge case) — surfaced explicitly rather than falling through
  // to the raw-input dump below, which showed the proposal that failed with
  // no indication anything went wrong.
  if (part.state === 'output-error') {
    return <ToolErrorNote message={part.errorText} />
  }

  const output = part.state === 'output-available' ? part.output : undefined

  if (part.type === 'tool-display_team') {
    return <TeamDisplay output={output as Parameters<typeof TeamDisplay>[0]['output']} />
  }
  if (part.type === 'tool-display_work_items') {
    return <WorkItemsDisplay output={output as Parameters<typeof WorkItemsDisplay>[0]['output']} />
  }
  if (part.type === 'tool-get_blockers') {
    return <BlockersDisplay output={output as Parameters<typeof BlockersDisplay>[0]['output']} />
  }

  if (isChatWriteToolName(toolName) && output !== undefined) {
    return <WriteAppliedChip toolName={toolName} output={output} />
  }

  if (output !== undefined) return null // known tool ran, no custom renderer → suppress

  return <UnknownToolDisplay toolName={toolName} input={part.input} />
}
