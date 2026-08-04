import { DocsCommandPalette } from '@/components/docs/docs-command-palette'

// Mounts the Cmd+K palette once for every /docs/* route, rather than
// duplicating it in both app/docs/page.tsx and app/docs/[id]/page.tsx.
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <DocsCommandPalette />
    </>
  )
}
