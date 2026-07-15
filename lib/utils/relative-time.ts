const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'always', style: 'narrow' })

export function relativeTime(date: Date, from: Date = new Date()): string {
  const delta = date.getTime() - from.getTime()
  for (const [unit, ms] of UNITS) {
    if (Math.abs(delta) >= ms) {
      return formatter.format(Math.round(delta / ms), unit)
    }
  }
  return 'now'
}
