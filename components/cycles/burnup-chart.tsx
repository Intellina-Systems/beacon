'use client'

import { useMemo, useRef, useState } from 'react'
import { Table2, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export interface CycleSnapshotPoint {
  snapshotDate: string // 'YYYY-MM-DD'
  scopePoints: number
  startedPoints: number
  completedPoints: number
}

interface Series {
  key: 'scopePoints' | 'startedPoints' | 'completedPoints'
  label: string
  color: string // CSS var()
  dashed?: boolean
}

// Scope=amber dashed (the ceiling — scope creep is the "attention" signal,
// same hue as at-risk), started=blue, completed=green (shares Beacon's
// --success hue 155). The trio is CVD-validated in both themes; the dash on
// scope is the secondary encoding so the reference line never relies on hue.
const SERIES: Series[] = [
  { key: 'scopePoints', label: 'Scope', color: 'var(--chart-5)', dashed: true },
  { key: 'startedPoints', label: 'Started', color: 'var(--chart-2)' },
  { key: 'completedPoints', label: 'Completed', color: 'var(--chart-4)' },
]

const VIEW_W = 720
const VIEW_H = 260
const PAD_LEFT = 36
const PAD_RIGHT = 16
const PAD_TOP = 16
const PAD_BOTTOM = 28

function niceCeil(value: number): number {
  if (value <= 0) return 4
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const steps = [1, 2, 2.5, 5, 10]
  for (const step of steps) {
    const candidate = step * magnitude
    if (candidate >= value) return candidate
  }
  return 10 * magnitude
}

function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${Number(m)}/${Number(d)}`
}

export function BurnupChart({
  snapshots,
  startsAt,
  endsAt,
}: {
  snapshots: CycleSnapshotPoint[]
  startsAt: string | Date
  endsAt: string | Date
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [tableView, setTableView] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const sorted = useMemo(() => [...snapshots].sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate)), [snapshots])

  const { xScale, yScale, yTicks, maxY, pathFor, points } = useMemo(() => {
    const start = new Date(startsAt).getTime()
    const end = new Date(endsAt).getTime()
    const domainStart = Math.min(start, sorted[0] ? new Date(sorted[0].snapshotDate).getTime() : start)
    const domainEnd = Math.max(end, sorted.length ? new Date(sorted[sorted.length - 1].snapshotDate).getTime() : end)
    const span = Math.max(domainEnd - domainStart, 1)

    const maxScope = sorted.reduce((max, s) => Math.max(max, s.scopePoints), 0)
    const niceMax = niceCeil(maxScope || 4)

    const xScale = (t: number) => PAD_LEFT + ((t - domainStart) / span) * (VIEW_W - PAD_LEFT - PAD_RIGHT)
    const yScale = (v: number) => VIEW_H - PAD_BOTTOM - (v / niceMax) * (VIEW_H - PAD_TOP - PAD_BOTTOM)

    const points = sorted.map((s) => ({ ...s, x: xScale(new Date(s.snapshotDate).getTime()) }))

    const pathFor = (key: Series['key']) =>
      points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${yScale(p[key]).toFixed(1)}`).join(' ')

    const tickCount = 4
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => (niceMax / tickCount) * i)

    return { xScale, yScale, yTicks, maxY: niceMax, pathFor, points }
  }, [sorted, startsAt, endsAt])

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!svgRef.current || points.length === 0) return
    const rect = svgRef.current.getBoundingClientRect()
    const scale = VIEW_W / rect.width
    const localX = (e.clientX - rect.left) * scale
    let nearest = 0
    let nearestDist = Infinity
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - localX)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = i
      }
    })
    setHoverIndex(nearest)
  }

  if (sorted.length === 0) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-center">
        <TrendingUp className="h-5 w-5 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No burnup data yet</p>
        <p className="max-w-xs text-xs text-muted-foreground/70">
          Snapshots are taken hourly once this cycle has work items — check back after the next sync.
        </p>
      </div>
    )
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setTableView((v) => !v)}>
          <Table2 className="mr-1 h-3 w-3" />
          {tableView ? 'View chart' : 'View table'}
        </Button>
      </div>

      {tableView ? (
        <div className="max-h-56 overflow-y-auto rounded-md border">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="sticky top-0 bg-muted/60">
                <TableHead className="px-2.5 py-1.5 h-auto font-medium text-muted-foreground">Date</TableHead>
                <TableHead className="px-2.5 py-1.5 h-auto text-right font-medium text-muted-foreground">
                  Scope
                </TableHead>
                <TableHead className="px-2.5 py-1.5 h-auto text-right font-medium text-muted-foreground">
                  Started
                </TableHead>
                <TableHead className="px-2.5 py-1.5 h-auto text-right font-medium text-muted-foreground">
                  Completed
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y">
              {sorted.map((s) => (
                <TableRow key={s.snapshotDate}>
                  <TableCell className="px-2.5 py-1.5 font-mono">{s.snapshotDate}</TableCell>
                  <TableCell className="px-2.5 py-1.5 text-right tabular-nums">{s.scopePoints}</TableCell>
                  <TableCell className="px-2.5 py-1.5 text-right tabular-nums">{s.startedPoints}</TableCell>
                  <TableCell className="px-2.5 py-1.5 text-right tabular-nums">{s.completedPoints}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="h-56 w-full touch-none"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoverIndex(null)}
            role="img"
            aria-label="Cycle burnup chart: scope, started, and completed points over time"
          >
            {yTicks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD_LEFT}
                  x2={VIEW_W - PAD_RIGHT}
                  y1={yScale(tick)}
                  y2={yScale(tick)}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
                <text
                  x={PAD_LEFT - 8}
                  y={yScale(tick) + 3}
                  textAnchor="end"
                  fontSize={9}
                  fill="var(--muted-foreground)"
                >
                  {Math.round(tick)}
                </text>
              </g>
            ))}

            <line
              x1={PAD_LEFT}
              x2={VIEW_W - PAD_RIGHT}
              y1={VIEW_H - PAD_BOTTOM}
              y2={VIEW_H - PAD_BOTTOM}
              stroke="var(--border)"
              strokeWidth={1}
            />
            {[points[0], points[points.length - 1]].map((p, i) => (
              <text
                key={i}
                x={p.x}
                y={VIEW_H - PAD_BOTTOM + 16}
                textAnchor={i === 0 ? 'start' : 'end'}
                fontSize={9}
                fill="var(--muted-foreground)"
              >
                {formatDate(p.snapshotDate)}
              </text>
            ))}

            {hovered && (
              <line
                x1={hovered.x}
                x2={hovered.x}
                y1={PAD_TOP}
                y2={VIEW_H - PAD_BOTTOM}
                stroke="var(--muted-foreground)"
                strokeWidth={1}
                strokeOpacity={0.5}
              />
            )}

            {SERIES.map((s) => (
              <path
                key={s.key}
                d={pathFor(s.key)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? '5 5' : undefined}
              />
            ))}

            {SERIES.map((s) => {
              const last = points[points.length - 1]
              return (
                <circle
                  key={s.key}
                  cx={last.x}
                  cy={yScale(last[s.key])}
                  r={4}
                  fill={s.color}
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              )
            })}

            {hovered &&
              SERIES.map((s) => (
                <circle
                  key={s.key}
                  cx={hovered.x}
                  cy={yScale(hovered[s.key])}
                  r={3.5}
                  fill={s.color}
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              ))}
          </svg>

          {hovered && (
            <div
              className="pointer-events-none absolute top-1 rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-md"
              style={{
                left: `${Math.min(Math.max((hovered.x / VIEW_W) * 100, 12), 88)}%`,
                transform: 'translateX(-50%)',
              }}
            >
              <p className="mb-1 font-mono text-[10px] text-muted-foreground">{hovered.snapshotDate}</p>
              {SERIES.map((s) => (
                <div key={s.key} className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="font-semibold tabular-nums">{hovered[s.key]}</span>
                  <span className="text-muted-foreground">{s.label.toLowerCase()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
