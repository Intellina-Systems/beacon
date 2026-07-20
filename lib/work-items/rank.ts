// Fractional-index ranks: base-62 strings ordered lexicographically.
// rankBetween(a, b) returns a string strictly between a and b, so a drag-drop
// reorder is always a single-row update. Strings grow only when repeatedly
// inserting into the same gap. Generated ranks never end in '0', so there is
// always room below any existing rank.

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const BASE = DIGITS.length

function digitAt(value: string, index: number): number {
  if (index >= value.length) return 0
  const digit = DIGITS.indexOf(value[index])
  if (digit === -1) throw new Error(`Invalid rank character: ${value[index]}`)
  return digit
}

/**
 * Returns a rank strictly between `before` and `after`.
 * - `before = null` → below everything (start of list)
 * - `after = null` → above everything (end of list)
 */
export function rankBetween(before: string | null | undefined, after: string | null | undefined): string {
  const a = before ?? ''
  const b = after ?? ''
  let upperUnbounded = b === ''

  if (!upperUnbounded && a >= b) {
    throw new Error(`rankBetween: "${a}" must sort before "${b}"`)
  }

  let result = ''
  for (let i = 0; ; i++) {
    const da = digitAt(a, i)
    const db = upperUnbounded ? BASE : digitAt(b, i)

    if (db - da > 1) {
      // Room at this position: the midpoint digit is > da and < db, and ≥ 1,
      // so the produced rank never ends in '0'.
      return result + DIGITS[Math.floor((da + db) / 2)]
    }

    // Digits equal (da === db) or adjacent (db === da + 1): keep a's digit and
    // move on. Once we consume an adjacent pair, everything after `a` is a
    // valid lower bound and the upper bound stops constraining us.
    result += DIGITS[da]
    if (db - da === 1) upperUnbounded = true
  }
}

/** Rank for appending at the end of a list whose current last rank is `last`. */
export function rankAfter(last: string | null | undefined): string {
  return rankBetween(last ?? null, null)
}
