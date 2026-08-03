import { type NextRequest } from 'next/server'
import { checkDueDates } from '@/lib/work-items/due-dates'
import { runHygiene } from '@/lib/work-items/hygiene'
import { generateInsights } from '@/lib/insights/generate'
import { checkPlanReminders } from '@/lib/plans/reminders'

export const maxDuration = 300

function isAuthorizedCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return process.env.NODE_ENV !== 'production'
  }
  return req.headers.get('authorization') === `Bearer ${cronSecret}`
}

// Runs hourly: due-date reminders (emitted as events — automation rules can
// react to them), plan reminders (fires at most once per member per local
// day, gated by an idempotent externalId — safe to run every tick), auto-
// close/auto-archive hygiene, then insight generation (which reads the
// resulting event stream, so it runs last).
export async function GET(req: NextRequest): Promise<Response> {
  if (!isAuthorizedCronRequest(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const dueDates = await checkDueDates()
    const planReminders = await checkPlanReminders()
    const hygiene = await runHygiene()
    const insightsResult = await generateInsights()

    return Response.json({ success: true, dueDates, planReminders, hygiene, insights: insightsResult })
  } catch (error) {
    console.error('[cron intelligence] failed:', error)
    return Response.json({ error: 'Cron intelligence failed' }, { status: 500 })
  }
}
