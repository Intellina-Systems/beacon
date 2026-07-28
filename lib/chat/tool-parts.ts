export type AnyPart = { type: string; state?: string; input?: unknown; output?: unknown; toolCallId?: string }

export function resolveToolName(part: AnyPart): string {
  if (part.type.startsWith('tool-')) return part.type.slice(5)
  if (part.type === 'dynamic-tool') return (part as { toolName?: string }).toolName ?? 'unknown'
  return part.type
}
