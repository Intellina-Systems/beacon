'use client'

import { SuggestionMenuController, type DefaultReactSuggestionItem } from '@blocknote/react'
import { STATUS_META } from '@/lib/work-items/constants'
import type { WorkItemStatus } from '@/lib/db/schema'
import type { docSchema } from './doc-schema'

type DocEditorInstance = typeof docSchema.BlockNoteEditor

interface MentionResponse {
  members: { id: string; name: string; title: string | null }[]
  workItems: { id: string; key: string | null; title: string; status: string }[]
}

async function fetchMentions(query: string): Promise<MentionResponse> {
  try {
    const res = await fetch(`/api/docs/mentions?q=${encodeURIComponent(query)}`)
    if (!res.ok) return { members: [], workItems: [] }
    return (await res.json()) as MentionResponse
  } catch {
    return { members: [], workItems: [] }
  }
}

/**
 * `@` opens the people picker and `#` opens the work-item picker. Both read
 * from the same endpoint; each menu keeps only the half it needs.
 */
export function MentionMenus({ editor }: { editor: DocEditorInstance }) {
  return (
    <>
      <SuggestionMenuController
        triggerCharacter="@"
        getItems={async (query): Promise<DefaultReactSuggestionItem[]> => {
          const { members } = await fetchMentions(query)
          return members.map((member) => ({
            title: member.name,
            subtext: member.title ?? undefined,
            group: 'People',
            onItemClick: () => {
              editor.insertInlineContent([
                { type: 'personMention', props: { memberId: member.id, name: member.name } },
                ' ',
              ])
            },
          }))
        }}
      />
      <SuggestionMenuController
        triggerCharacter="#"
        getItems={async (query): Promise<DefaultReactSuggestionItem[]> => {
          const { workItems } = await fetchMentions(query)
          return workItems.map((item) => ({
            title: item.key ? `${item.key} · ${item.title}` : item.title,
            subtext: STATUS_META[item.status as WorkItemStatus]?.label,
            group: 'Work items',
            onItemClick: () => {
              editor.insertInlineContent([
                {
                  type: 'workItemMention',
                  props: { itemId: item.id, itemKey: item.key ?? '', title: item.title, status: item.status },
                },
                ' ',
              ])
            },
          }))
        }}
      />
    </>
  )
}
