import { notFound } from 'next/navigation'
import { getPublicDoc } from '@/lib/docs/public'
import { PublicDocViewClient } from '@/components/docs/public-doc-view-client'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const doc = await getPublicDoc(token)
  return { title: doc?.title || 'Shared document' }
}

export default async function PublicDocPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const doc = await getPublicDoc(token)
  if (!doc) notFound()

  return <PublicDocViewClient title={doc.title} content={doc.content} />
}
