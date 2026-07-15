import { type NextRequest } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import {
  ChangelogAiConfigurationError,
  GitHubNotConnectedError,
  generateCommitsSummaryText,
  generateProductChangelog,
} from '@/lib/github/changelog'

interface GenerateSummaryRequest {
  commits: Array<{
    message: string
    authorLogin?: string | null
    committedAt?: Date | null
  }>
  mode?: 'summary' | 'changelog'
  since?: string
}

const defaultSince = () => {
  const since = new Date()
  since.setDate(since.getDate() - 90)
  return since
}

const getApiErrorMessage = (error: unknown, mode: 'summary' | 'changelog') => {
  if (error instanceof ChangelogAiConfigurationError) {
    return 'OpenAI API key not configured'
  }

  if (error instanceof GitHubNotConnectedError) {
    return 'GitHub account not connected'
  }

  const status =
    typeof error === 'object' && error !== null && 'status' in error ? (error as { status?: number }).status : undefined

  if (status === 401 || status === 403) {
    return mode === 'changelog'
      ? 'GitHub authorization expired or missing. Reconnect GitHub and try again.'
      : 'OpenAI authorization failed. Check API key and try again.'
  }

  if (status === 404) {
    return 'Repository data not available for changelog generation.'
  }

  if (status === 429) {
    return 'Rate limit reached. Try again later or reduce the number of PRs.'
  }

  return mode === 'changelog' ? 'Failed to generate changelog' : 'Failed to generate summary'
}

const getApiErrorStatus = (error: unknown) => {
  if (error instanceof ChangelogAiConfigurationError) {
    return 503
  }

  if (error instanceof GitHubNotConnectedError) {
    return 400
  }

  const status =
    typeof error === 'object' && error !== null && 'status' in error ? (error as { status?: number }).status : undefined

  if (status === 401 || status === 403) {
    return 401
  }

  if (status === 404) {
    return 404
  }

  if (status === 429) {
    return 429
  }

  return 500
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  let responseMode: 'summary' | 'changelog' = 'summary'

  try {
    const { commits, mode, since } = (await req.json()) as GenerateSummaryRequest
    const requestedMode = mode === 'changelog' ? 'changelog' : 'summary'
    responseMode = requestedMode

    if (requestedMode === 'summary') {
      if (!commits || commits.length === 0) {
        return Response.json({ error: 'No commits provided' }, { status: 400 })
      }

      const summary = await generateCommitsSummaryText(commits)
      return Response.json({ mode: 'summary', summary })
    }

    const session = await getServerSession()
    if (!session?.user?.id) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await params
    const sinceDate = since ? new Date(since) : defaultSince()
    const effectiveSince = Number.isNaN(sinceDate.getTime()) ? defaultSince() : sinceDate

    const { range, entries } = await generateProductChangelog(session.user.id, id, effectiveSince)

    return Response.json({ mode: 'changelog', range, entries })
  } catch (error) {
    return Response.json({ error: getApiErrorMessage(error, responseMode) }, { status: getApiErrorStatus(error) })
  }
}
