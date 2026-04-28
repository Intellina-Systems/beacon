import { getServerSession } from '@/lib/session/get-server-session'
import { getGitHubApiErrorMessage, listGitHubRepositories } from '@/lib/github/product-sync'

export async function GET(): Promise<Response> {
  const session = await getServerSession()
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const repositories = await listGitHubRepositories()
    return Response.json({ repositories })
  } catch (error) {
    return Response.json({ error: getGitHubApiErrorMessage(error) }, { status: 500 })
  }
}
