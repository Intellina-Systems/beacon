import { type NextRequest } from 'next/server'
import { generateObject, generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { Octokit } from '@octokit/rest'
import { and, desc, eq, gte } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { githubPullRequests, productGitHubRepositories } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubTokenForUserId } from '@/lib/github/user-token'

interface GenerateSummaryRequest {
  commits: Array<{
    message: string
    authorLogin?: string | null
    committedAt?: Date | null
  }>
  mode?: 'summary' | 'changelog'
  since?: string
}

type ChangelogFileSummary = {
  added: string[]
  removed: string[]
  modified: Array<{ path: string; additions: number; deletions: number }>
  renamed: Array<{ from: string; to: string; additions: number; deletions: number }>
}

type ChangelogSummary = {
  briefSummary: string
  whatChanged: string[]
  important: string[]
}

const changelogSummarySchema = z.object({
  briefSummary: z.string().describe('one short paragraph (2-4 sentences)'),
  whatChanged: z.array(z.string()).describe('array of 3-6 bullets describing what changed'),
  important: z.array(z.string()).describe('array of 1-3 bullets highlighting important notes'),
})

const batchSummarySchema = z.object({
  summaries: z.array(
    z.object({
      number: z.number().describe('PR number'),
      briefSummary: z.string().describe('one short paragraph (2-4 sentences)'),
      whatChanged: z.array(z.string()).describe('array of 3-6 bullets'),
      important: z.array(z.string()).describe('array of 1-3 bullets'),
    }),
  ),
})

type ChangelogEntry = {
  number: number
  title: string
  authorLogin: string | null
  htmlUrl: string
  state: string
  updatedAt: string | null
  mergedAt: string | null
  additions: number
  deletions: number
  changedFiles: number
  summary: ChangelogSummary
}

const defaultSince = () => {
  const since = new Date()
  since.setDate(since.getDate() - 90)
  return since
}

const clampText = (value: string | null | undefined, maxLength: number) => {
  if (!value) return ''
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength).trim()}...`
}

const formatFileList = (items: string[], limit = 12) => {
  if (items.length === 0) return 'None'
  const visible = items.slice(0, limit)
  const remainder = items.length - visible.length
  return remainder > 0 ? `${visible.join(', ')} (+${remainder} more)` : visible.join(', ')
}

const getApiErrorMessage = (error: unknown, mode: 'summary' | 'changelog') => {
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

const summarizePullRequest = async (input: {
  title: string
  body: string | null
  author: string | null
  state: string
  additions: number
  deletions: number
  changedFiles: number
  files: ChangelogFileSummary
}): Promise<ChangelogSummary> => {
  const prompt = `You are writing a detailed changelog entry for a pull request.\n\nPR Title: ${input.title}\nPR Author: ${input.author ?? 'Unknown'}\nPR State: ${input.state}\nPR Description: ${clampText(input.body, 1200) || 'None'}\nStats: +${input.additions} -${input.deletions} across ${input.changedFiles} files\nAdded files: ${formatFileList(input.files.added)}\nRemoved files: ${formatFileList(input.files.removed)}\nModified files: ${formatFileList(input.files.modified.map((file) => file.path))}\nRenamed files: ${formatFileList(input.files.renamed.map((file) => `${file.from} -> ${file.to}`))}\n\nProvide a detailed changelog entry with a brief summary paragraph, list of what changed, and important notes.`

  const result = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: changelogSummarySchema,
    prompt,
  })

  return result.object
}

const safeSummarizePullRequest = async (input: {
  title: string
  body: string | null
  author: string | null
  state: string
  additions: number
  deletions: number
  changedFiles: number
  files: ChangelogFileSummary
}): Promise<ChangelogSummary> => {
  try {
    return await summarizePullRequest(input)
  } catch {
    return {
      briefSummary: 'Summary unavailable for this PR.',
      whatChanged: ['Summary unavailable for this PR.'],
      important: [],
    }
  }
}

const summarizePullRequestsBatch = async (
  inputs: Array<{
    number: number
    title: string
    body: string | null
    author: string | null
    state: string
    additions: number
    deletions: number
    changedFiles: number
    files: ChangelogFileSummary
  }>,
): Promise<Map<number, ChangelogSummary>> => {
  if (inputs.length === 0) return new Map()

  const prDescriptions = inputs
    .map(
      (input) =>
        `PR #${input.number}: ${input.title}\nAuthor: ${input.author ?? 'Unknown'}\nState: ${input.state}\nDescription: ${clampText(input.body, 800) || 'None'}\nStats: +${input.additions} -${input.deletions} across ${input.changedFiles} files\nAdded: ${formatFileList(input.files.added, 8)}\nRemoved: ${formatFileList(input.files.removed, 8)}\nModified: ${formatFileList(
          input.files.modified.map((f) => f.path),
          8,
        )}\nRenamed: ${formatFileList(
          input.files.renamed.map((f) => `${f.from} -> ${f.to}`),
          8,
        )}`,
    )
    .join('\n---\n')

  const prompt = `You are writing detailed changelog entries for pull requests.\n\nFor each PR below, create summaries with brief paragraphs, what changed bullets, and important notes.\n\nPRs:\n${prDescriptions}\n\nProvide structured entries for all PRs.`

  try {
    const result = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: batchSummarySchema,
      prompt,
    })

    const summaryMap = new Map<number, ChangelogSummary>()
    for (const item of result.object.summaries) {
      summaryMap.set(item.number, {
        briefSummary: item.briefSummary || 'Summary unavailable for this PR.',
        whatChanged: item.whatChanged || ['Summary unavailable for this PR.'],
        important: item.important || [],
      })
    }
    return summaryMap
  } catch {
    const fallback = new Map<number, ChangelogSummary>()
    for (const input of inputs) {
      fallback.set(input.number, {
        briefSummary: 'Summary unavailable for this PR.',
        whatChanged: ['Summary unavailable for this PR.'],
        important: [],
      })
    }
    return fallback
  }
}

const mapWithConcurrency = async <T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>) => {
  const results: R[] = new Array(items.length)
  let index = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const current = index
      index += 1
      if (current >= items.length) break
      results[current] = await mapper(items[current], current)
    }
  })

  await Promise.all(workers)
  return results
}

const listAllPullRequestFiles = async (octokit: Octokit, owner: string, repo: string, pullNumber: number) => {
  const files = [] as Awaited<ReturnType<typeof octokit.rest.pulls.listFiles>>['data']
  let page = 1

  while (true) {
    const response = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
      page,
    })

    files.push(...response.data)

    if (response.data.length < 100) {
      break
    }

    page += 1
  }

  return files
}

const safeListPullRequestFiles = async (octokit: Octokit, owner: string, repo: string, pullNumber: number) => {
  try {
    return await listAllPullRequestFiles(octokit, owner, repo, pullNumber)
  } catch {
    return [] as Awaited<ReturnType<typeof octokit.rest.pulls.listFiles>>['data']
  }
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

      const commitText = commits
        .map((c) => {
          const author = c.authorLogin ? `@${c.authorLogin}` : 'Unknown'
          const date = c.committedAt ? new Date(c.committedAt).toLocaleDateString() : 'Unknown date'
          return `- ${c.message.split('\n')[0]} (${author}, ${date})`
        })
        .join('\n')

      const { text } = await generateText({
        model: openai('gpt-4o-mini'),
        prompt: `Provide a brief 2-3 sentence summary of what was changed in these commits:\n\n${commitText}`,
      })

      return Response.json({ mode: 'summary', summary: text || 'Could not generate summary' })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return Response.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const session = await getServerSession()
    if (!session?.user?.id) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const token = await getGitHubTokenForUserId(session.user.id)
    if (!token) {
      return Response.json({ error: 'GitHub account not connected' }, { status: 400 })
    }

    const { id } = await params
    const sinceDate = since ? new Date(since) : defaultSince()
    const effectiveSince = Number.isNaN(sinceDate.getTime()) ? defaultSince() : sinceDate
    const toDate = new Date()

    const repositories = await db
      .select({
        id: productGitHubRepositories.id,
        owner: productGitHubRepositories.owner,
        repo: productGitHubRepositories.repo,
      })
      .from(productGitHubRepositories)
      .where(eq(productGitHubRepositories.productId, id))

    const repoMap = new Map(repositories.map((repo) => [repo.id, { owner: repo.owner, repo: repo.repo }]))

    const pullRequests = await db
      .select({
        repositoryId: githubPullRequests.repositoryId,
        number: githubPullRequests.number,
        title: githubPullRequests.title,
        body: githubPullRequests.body,
        authorLogin: githubPullRequests.authorLogin,
        htmlUrl: githubPullRequests.htmlUrl,
        state: githubPullRequests.state,
        githubUpdatedAt: githubPullRequests.githubUpdatedAt,
        githubMergedAt: githubPullRequests.githubMergedAt,
      })
      .from(githubPullRequests)
      .where(and(eq(githubPullRequests.productId, id), gte(githubPullRequests.githubUpdatedAt, effectiveSince)))
      .orderBy(desc(githubPullRequests.githubUpdatedAt))

    const octokit = new Octokit({ auth: token })

    // Step 1: Fetch all PR file data concurrently (unavoidable, per GitHub API design)
    const prDataWithFiles = await mapWithConcurrency(pullRequests, 5, async (pr) => {
      const repo = repoMap.get(pr.repositoryId)
      if (!repo) return null

      const files = await safeListPullRequestFiles(octokit, repo.owner, repo.repo, pr.number)
      const fileSummary: ChangelogFileSummary = {
        added: [],
        removed: [],
        modified: [],
        renamed: [],
      }

      let additions = 0
      let deletions = 0

      for (const file of files) {
        additions += file.additions ?? 0
        deletions += file.deletions ?? 0

        if (file.status === 'added') {
          fileSummary.added.push(file.filename)
        } else if (file.status === 'removed') {
          fileSummary.removed.push(file.filename)
        } else if (file.status === 'renamed') {
          fileSummary.renamed.push({
            from: file.previous_filename ?? file.filename,
            to: file.filename,
            additions: file.additions ?? 0,
            deletions: file.deletions ?? 0,
          })
        } else {
          fileSummary.modified.push({
            path: file.filename,
            additions: file.additions ?? 0,
            deletions: file.deletions ?? 0,
          })
        }
      }

      return {
        pr,
        files: fileSummary,
        additions,
        deletions,
      }
    })

    const validatedData = prDataWithFiles.filter((item): item is NonNullable<typeof item> => item !== null)

    // Step 2: Batch PR summaries (5 PRs per OpenAI call instead of 1 per call)
    const batchSize = 5
    const summaryMap = new Map<number, ChangelogSummary>()

    for (let i = 0; i < validatedData.length; i += batchSize) {
      const batch = validatedData.slice(i, Math.min(i + batchSize, validatedData.length))
      const batchInputs = batch.map((item) => ({
        number: item.pr.number,
        title: item.pr.title,
        body: item.pr.body ?? null,
        author: item.pr.authorLogin ?? null,
        state: item.pr.state,
        additions: item.additions,
        deletions: item.deletions,
        changedFiles:
          item.files.added.length + item.files.removed.length + item.files.modified.length + item.files.renamed.length,
        files: item.files,
      }))

      const batchSummaries = await summarizePullRequestsBatch(batchInputs)
      for (const [number, summary] of batchSummaries) {
        summaryMap.set(number, summary)
      }
    }

    // Step 3: Assemble final entries in original order
    const entries = validatedData.map((item) => ({
      number: item.pr.number,
      title: item.pr.title,
      authorLogin: item.pr.authorLogin ?? null,
      htmlUrl: item.pr.htmlUrl,
      state: item.pr.state,
      updatedAt: item.pr.githubUpdatedAt ? item.pr.githubUpdatedAt.toISOString() : null,
      mergedAt: item.pr.githubMergedAt ? item.pr.githubMergedAt.toISOString() : null,
      additions: item.additions,
      deletions: item.deletions,
      changedFiles:
        item.files.added.length + item.files.removed.length + item.files.modified.length + item.files.renamed.length,
      summary: summaryMap.get(item.pr.number) ?? {
        briefSummary: 'Summary unavailable for this PR.',
        whatChanged: ['Summary unavailable for this PR.'],
        important: [],
      },
    }))

    const filteredEntries = entries.filter((entry): entry is ChangelogEntry => entry !== null)

    return Response.json({
      mode: 'changelog',
      range: { from: effectiveSince.toISOString(), to: toDate.toISOString() },
      entries: filteredEntries,
    })
  } catch (error) {
    return Response.json({ error: getApiErrorMessage(error, responseMode) }, { status: 500 })
  }
}
