'use client'

import { ExternalLink } from 'lucide-react'
import {
  DeleteLinkButton,
  EditLinkButton,
  LinkToolbar,
  useComponentsContext,
  useDictionary,
  type LinkToolbarProps,
} from '@blocknote/react'
import { useRouter } from 'next/navigation'
import { openDocLink } from './open-doc-link'

// BlockNote's default OpenLinkButton hardcodes window.open(url, '_blank') —
// the same new-tab behavior the custom `links.onClick` in doc-editor.tsx
// fixes for a direct anchor click, but this toolbar button is a wholly
// separate code path (its own React component, not the ProseMirror click
// plugin), so it needs the same in-app-navigation fix applied separately.
function OpenDocLinkButton({ url }: Pick<LinkToolbarProps, 'url'>) {
  const Components = useComponentsContext()!
  const dict = useDictionary()
  const router = useRouter()

  return (
    <Components.LinkToolbar.Button
      className="bn-button"
      mainTooltip={dict.link_toolbar.open.tooltip}
      label={dict.link_toolbar.open.tooltip}
      isSelected={false}
      onClick={() => openDocLink(url, router)}
      icon={<ExternalLink className="h-3.5 w-3.5" />}
    />
  )
}

export function DocLinkToolbar(props: LinkToolbarProps) {
  return (
    <LinkToolbar {...props}>
      <EditLinkButton
        url={props.url}
        text={props.text}
        range={props.range}
        setToolbarOpen={props.setToolbarOpen}
        setToolbarPositionFrozen={props.setToolbarPositionFrozen}
      />
      <OpenDocLinkButton url={props.url} />
      <DeleteLinkButton range={props.range} setToolbarOpen={props.setToolbarOpen} />
    </LinkToolbar>
  )
}
