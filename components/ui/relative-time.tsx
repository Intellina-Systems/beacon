import { relativeTime } from '@/lib/utils/relative-time'

/**
 * Renders a relative timestamp without tripping hydration.
 *
 * `relativeTime` reads the clock, so the server renders "7m ago" and the client
 * hydrates a moment later and computes "8m ago" — a text mismatch React treats
 * as a hydration error and recovers from by discarding the server tree.
 *
 * `suppressHydrationWarning` is the sanctioned escape hatch for exactly this
 * (timestamps): React keeps the client's value and stays quiet. The machine
 * -readable instant still ships in `dateTime`, which is deterministic.
 *
 * Deliberately no `title` with a locale-formatted date — that would reintroduce
 * the same mismatch through timezone and locale differences.
 */
export function RelativeTime({
  date,
  className,
  prefix,
}: {
  date: Date | string | number
  className?: string
  /** Rendered inside the same node, e.g. "synced " → "synced 8m ago". */
  prefix?: string
}) {
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return null

  return (
    <time dateTime={value.toISOString()} className={className} suppressHydrationWarning>
      {prefix}
      {relativeTime(value)}
    </time>
  )
}
