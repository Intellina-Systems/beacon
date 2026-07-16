'use client'

import { useState } from 'react'
import { Bot, Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const EXAMPLE = `curl -X POST https://beacon-tool.vercel.app/api/events \\
  -H "Authorization: Bearer bcn_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "agent.blocked",
    "task": "BCN-42",
    "engineer": "yohan",
    "reason": "API schema mismatch",
    "confidence": 0.92
  }'`

export function AgentSetupCard() {
  const [copied, setCopied] = useState(false)

  function copyExample() {
    navigator.clipboard.writeText(EXAMPLE)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="h-4 w-4" />
          Coding agent plugin
        </CardTitle>
        <CardDescription>
          Agents emit structured events as they work — session start, planning, tests, blockers, completion. Beacon
          correlates them to work items and engineers automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <pre className="rounded-md border bg-muted/40 p-4 pr-12 text-xs font-mono overflow-x-auto">{EXAMPLE}</pre>
          <Button
            size="sm"
            variant="ghost"
            className="absolute top-2 right-2 h-7 w-7 p-0 text-muted-foreground"
            onClick={copyExample}
            title="Copy to clipboard"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Batch with <code className="font-mono">{'{ "events": [...] }'}</code>. Known types:{' '}
          <code className="font-mono">
            agent.session_started, agent.planning, agent.implementation_started, agent.tests_passed, agent.tests_failed,
            agent.blocked, agent.completed, task.started, task.completed, ci.passed, ci.failed, deploy.completed
          </code>
          — anything dot-namespaced is accepted.
        </p>
      </CardContent>
    </Card>
  )
}
