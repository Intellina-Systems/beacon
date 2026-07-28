import {
  TeamDisplay,
  WorkItemsDisplay,
  BlockersDisplay,
  UnknownToolDisplay,
  ToolLoading,
} from '@/components/chat/tool-renderers'
import { resolveToolName, type AnyPart } from '@/lib/chat/tool-parts'

export function ToolPartRenderer({ part }: { part: AnyPart }) {
  const toolName = resolveToolName(part)

  if (part.state === 'input-streaming') {
    return <ToolLoading label={`Running ${toolName}…`} />
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

  if (output !== undefined) return null // known tool ran, no custom renderer → suppress

  return <UnknownToolDisplay toolName={toolName} input={part.input} />
}
