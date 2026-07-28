import { Sparkles } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { cn } from '@/lib/utils'
import { ToolPartRenderer } from './tool-part-renderer'
import type { AnyPart } from '@/lib/chat/tool-parts'
import type { UIMessage } from 'ai'

export function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-3', isUser && 'justify-end')}>
      {!isUser && (
        <div className="h-7 w-7 rounded-full bg-foreground flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles className="h-3.5 w-3.5 text-background" />
        </div>
      )}

      <div className={cn('flex flex-col gap-2 max-w-[85%]', isUser && 'items-end')}>
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            if (!isUser) {
              return (
                <div key={i} className="rounded-2xl bg-muted px-4 py-3 text-foreground">
                  <Streamdown
                    className="text-sm leading-relaxed [&_a]:underline [&_a]:underline-offset-4 [&_pre]:max-w-full"
                    controls
                    isAnimating={part.state === 'streaming'}
                  >
                    {part.text}
                  </Streamdown>
                </div>
              )
            }

            return (
              <div
                key={i}
                className="rounded-2xl bg-foreground px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-background"
              >
                {part.text}
                {part.state === 'streaming' && (
                  <span className="inline-block w-1.5 h-3.5 bg-current opacity-70 animate-pulse ml-0.5 align-[-1px]" />
                )}
              </div>
            )
          }

          if (part.type === 'reasoning') {
            return (
              <div key={i} className="text-xs text-muted-foreground italic px-1">
                {part.text}
              </div>
            )
          }

          // Tool parts
          if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
            return (
              <div key={i} className="w-full">
                <ToolPartRenderer part={part as AnyPart} />
              </div>
            )
          }

          return null
        })}
      </div>
    </div>
  )
}
