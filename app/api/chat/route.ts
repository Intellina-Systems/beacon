import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { getServerSession } from '@/lib/session/get-server-session'

export async function POST(req: Request) {
  const session = await getServerSession()
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { messages } = await req.json()

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: `You are Beacon AI, an intelligent assistant for engineering teams.
You help product managers and engineers stay on top of their work by answering questions about their projects, priorities, team capacity, and blockers.
Be concise, direct, and practical. Use markdown formatting when it helps clarity.`,
    messages,
  })

  return result.toTextStreamResponse()
}
