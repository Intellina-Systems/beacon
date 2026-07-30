'use client'

import { createReactInlineContentSpec } from '@blocknote/react'
import { cn } from '@/lib/utils'
import { STATUS_META } from '@/lib/work-items/constants'
import { workItemHref } from '@/lib/work-items/href'
import type { WorkItemStatus } from '@/lib/db/schema'
import { useWorkItemSnapshot } from '../work-item-status-cache'

/**
 * `@person` — a durable reference to a workspace member. The name is stored
 * alongside the id so the chip still reads correctly in exports and public
 * shares, where no lookup is possible.
 */
export const PersonMention = createReactInlineContentSpec(
  {
    type: 'personMention',
    propSchema: {
      memberId: { default: '' },
      name: { default: 'Unknown' },
    },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => (
      <span
        className="rounded-sm bg-beacon/10 px-1 py-0.5 font-medium text-beacon"
        data-member-id={inlineContent.props.memberId}
      >
        @{inlineContent.props.name}
      </span>
    ),
  },
)

function WorkItemChip({
  itemId,
  itemKey,
  title,
  status,
}: {
  itemId: string
  itemKey: string
  title: string
  status: string
}) {
  const snapshot = useWorkItemSnapshot(itemId, { key: itemKey, title, status })
  const meta = STATUS_META[snapshot.status as WorkItemStatus]

  return (
    <a
      href={workItemHref({ id: itemId, key: itemKey })}
      className="inline-flex items-baseline gap-1.5 rounded-sm border bg-muted/40 px-1.5 py-0.5 align-baseline text-[0.9em] no-underline transition-colors hover:bg-accent"
      title={meta ? `${snapshot.title} — ${meta.label}` : snapshot.title}
    >
      <span
        className={cn(
          'relative top-[-1px] inline-block h-1.5 w-1.5 shrink-0 rounded-full',
          meta?.tone ?? 'bg-muted-foreground/60',
        )}
        aria-hidden="true"
      />
      {snapshot.key && <span className="font-mono text-muted-foreground">{snapshot.key}</span>}
      <span className="font-medium text-foreground">{snapshot.title}</span>
      <span className="sr-only">{meta ? ` (${meta.label})` : ''}</span>
    </a>
  )
}

/**
 * `#BEA-11` — a live reference to a work item. Props hold a snapshot taken at
 * insert time; the rendered chip refreshes its status from the server so a doc
 * never quietly misreports where a piece of work stands.
 */
export const WorkItemMention = createReactInlineContentSpec(
  {
    type: 'workItemMention',
    propSchema: {
      itemId: { default: '' },
      itemKey: { default: '' },
      title: { default: 'Untitled' },
      status: { default: 'todo' },
    },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => (
      <WorkItemChip
        itemId={inlineContent.props.itemId}
        itemKey={inlineContent.props.itemKey}
        title={inlineContent.props.title}
        status={inlineContent.props.status}
      />
    ),
  },
)

/**
 * Read-only twins of the two mention specs, for the public share view.
 *
 * The type names and prop schemas match exactly so a publicly shared doc parses
 * its stored content correctly, but these render the snapshot as plain text:
 * an anonymous reader has no session to refresh status with, and no access to
 * the `/work` link the signed-in chip points at.
 */
export const PersonMentionStatic = createReactInlineContentSpec(
  {
    type: 'personMention',
    propSchema: {
      memberId: { default: '' },
      name: { default: 'Unknown' },
    },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => (
      <span className="rounded-sm bg-muted px-1 py-0.5 font-medium">@{inlineContent.props.name}</span>
    ),
  },
)

export const WorkItemMentionStatic = createReactInlineContentSpec(
  {
    type: 'workItemMention',
    propSchema: {
      itemId: { default: '' },
      itemKey: { default: '' },
      title: { default: 'Untitled' },
      status: { default: 'todo' },
    },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => (
      <span className="inline-flex items-baseline gap-1.5 rounded-sm border bg-muted/40 px-1.5 py-0.5 text-[0.9em]">
        {inlineContent.props.itemKey && (
          <span className="font-mono text-muted-foreground">{inlineContent.props.itemKey}</span>
        )}
        <span className="font-medium">{inlineContent.props.title}</span>
      </span>
    ),
  },
)
