import { ListPageSkeleton } from '@/components/page-skeleton'

export default function Loading() {
  return <ListPageSkeleton title="Inbox" chips={3} maxWidth="max-w-3xl" />
}
