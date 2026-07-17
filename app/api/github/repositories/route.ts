import { getWorkspaceContext } from '@/lib/auth/workspace-context'
import { forbidden, isAdmin } from '@/lib/auth/permissions'
import { getGitHubApiErrorMessage, listGitHubRepositories } from '@/lib/github/repositories'

export async function GET(): Promise<Response> {
  const ctx = await getWorkspaceContext()
  if (!ctx) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdmin(ctx)) return forbidden()

  try {
    const repositories = await listGitHubRepositories()
    return Response.json({ repositories })
  } catch (error) {
    return Response.json({ error: getGitHubApiErrorMessage(error) }, { status: 500 })
  }
}
