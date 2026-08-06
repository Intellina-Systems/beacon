// Names of the chat tools that make real changes — needsApproval: true on
// each in lib/chat/tools/, so calling one only proposes the action (see
// components/chat/write-confirmation-card.tsx for where the user actually
// approves it). Kept in its own client-safe file (no 'server-only') so
// tool-part-renderer.tsx can tell a write tool apart from a read one
// without pulling in any of lib/chat/tools/'s server-only business logic.
export const CHAT_WRITE_TOOL_NAMES = [
  'create_work_item',
  'update_work_item',
  'add_relation',
  'add_comment',
  'create_doc',
  'update_doc',
  'move_doc',
  'add_doc_task',
  'toggle_doc_task',
] as const

export type ChatWriteToolName = (typeof CHAT_WRITE_TOOL_NAMES)[number]

export function isChatWriteToolName(name: string): name is ChatWriteToolName {
  return (CHAT_WRITE_TOOL_NAMES as readonly string[]).includes(name)
}
