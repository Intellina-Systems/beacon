import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core'
import { withMultiColumn } from '@blocknote/xl-multi-column'
import { PersonMention, PersonMentionStatic, WorkItemMention, WorkItemMentionStatic } from './blocks/mention-specs'
import { MermaidBlock, MermaidBlockStatic } from './blocks/mermaid-block'

/**
 * The editor schema for Beacon docs: BlockNote's defaults, plus column layouts,
 * plus the two inline references that make a doc aware of the workspace it
 * lives in — people and work items.
 *
 * Shared by the editor and the exporters so a mention renders the same way in a
 * PDF as it does on screen.
 */
export const docSchema = withMultiColumn(
  BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
      mermaidDiagram: MermaidBlock(),
    },
    inlineContentSpecs: {
      ...defaultInlineContentSpecs,
      personMention: PersonMention,
      workItemMention: WorkItemMention,
    },
  }),
)

export type DocSchema = typeof docSchema

/**
 * The same shape for the unauthenticated public share view — identical block
 * and inline types so stored content parses, but with the inert renderers.
 */
export const publicDocSchema = withMultiColumn(
  BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
      mermaidDiagram: MermaidBlockStatic(),
    },
    inlineContentSpecs: {
      ...defaultInlineContentSpecs,
      personMention: PersonMentionStatic,
      workItemMention: WorkItemMentionStatic,
    },
  }),
)
