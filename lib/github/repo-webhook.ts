import 'server-only'

import crypto from 'crypto'
import { Octokit } from '@octokit/rest'
import { encrypt } from '@/lib/crypto'
import { getGitHubTokenForWorkspace } from '@/lib/github/user-token'
import type { GithubWebhookConfig } from '@/lib/github/webhook-signature'

// Best-effort: a failure here (e.g. the connecting user's token lacks
// admin/hook rights on an org repo) must never block connecting the source —
// the hourly cron sync (lib/connectors/github.ts) keeps working regardless.
// Returns null on any failure; callers just skip storing webhook config.
export async function registerRepoWebhook(
  workspaceId: string,
  identifier: string,
  webhookUrl: string,
): Promise<GithubWebhookConfig | null> {
  try {
    const token = await getGitHubTokenForWorkspace(workspaceId)
    if (!token) return null
    const [owner, repo] = identifier.split('/')
    if (!owner || !repo) return null

    const secret = crypto.randomBytes(32).toString('hex')
    const octokit = new Octokit({ auth: token })
    const response = await octokit.rest.repos.createWebhook({
      owner,
      repo,
      config: { url: webhookUrl, content_type: 'json', secret, insecure_ssl: '0' },
      events: ['push', 'pull_request', 'issues', 'issue_comment'],
      active: true,
    })

    return { webhookId: response.data.id, webhookSecret: encrypt(secret) }
  } catch (error) {
    console.error(`[github-webhook] failed to register webhook for ${identifier}:`, error)
    return null
  }
}

// Best-effort, mirrors registerRepoWebhook — repo access may already be
// gone by the time a source is disconnected, so failures are swallowed.
export async function deregisterRepoWebhook(
  workspaceId: string,
  identifier: string,
  config: GithubWebhookConfig,
): Promise<void> {
  try {
    const token = await getGitHubTokenForWorkspace(workspaceId)
    if (!token) return
    const [owner, repo] = identifier.split('/')
    if (!owner || !repo) return

    const octokit = new Octokit({ auth: token })
    await octokit.rest.repos.deleteWebhook({ owner, repo, hook_id: config.webhookId })
  } catch (error) {
    console.error(`[github-webhook] failed to deregister webhook for ${identifier}:`, error)
  }
}
