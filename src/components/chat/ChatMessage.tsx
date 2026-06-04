'use client'

import { useMemo, useState, useCallback, isValidElement } from 'react'
import type { ChatMessage as ChatMessageType, CodeBlock } from '@/stores/chat-store'
import { useEditorStore } from '@/stores/editor-store'
import { Button } from '@/components/ui/button'
import { Copy, Code2, Check, User, Bot } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface ChatMessageProps {
  message: ChatMessageType
  onOpenCode?: (codeBlock: CodeBlock) => void
}

function formatTokenCount(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k'
  }
  return String(num)
}

export function ChatMessage({ message, onOpenCode }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopyMessage = useCallback(() => {
    // Strip thinking blocks for cleaner copy
    const clean = message.content.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim()
    navigator.clipboard.writeText(clean || message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [message.content])

  return (
    <div className={`flex gap-3 group ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-emerald-500/10 text-emerald-600'
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className={`flex-1 max-w-[85%] min-w-0 ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block max-w-full text-left rounded-2xl px-4 py-2.5 overflow-hidden ${
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted rounded-tl-sm'
          }`}
        >
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <MessageContent
              content={message.content}
              isStreaming={message.isStreaming}
              onOpenCode={onOpenCode}
            />
          )}
        </div>
        <div className={`mt-1 text-[10px] text-muted-foreground flex items-center gap-2 ${isUser ? 'justify-end' : ''}`}>
          <span>
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {message.model && (
              <span className="ml-2 opacity-65 font-mono text-[9px] bg-white/5 px-1 py-0.5 rounded border border-white/5">{message.model.replace('anthropic/', '')}</span>
            )}
            {!isUser && message.tokensIn !== undefined && message.tokensOut !== undefined && (
              <span className="ml-2 opacity-85 font-mono text-[9px] text-emerald-500/90 font-medium">
                Tokens: {formatTokenCount(message.tokensIn)} (in), {formatTokenCount(message.tokensOut)} (out)
                {message.cost !== undefined && message.cost > 0 && ` | Cost: $${message.cost.toFixed(4)}`}
              </span>
            )}
          </span>
          {message.content && (
            <button
              onClick={handleCopyMessage}
              className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
              title="Copy message"
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function MessageContent({
  content,
  isStreaming,
  onOpenCode,
}: {
  content: string
  isStreaming?: boolean
  onOpenCode?: (codeBlock: CodeBlock) => void
}) {
  // Split content into thinking blocks and regular content
  const segments = useMemo(() => {
    if (!content) return []
    const parts: { type: 'thinking' | 'text'; content: string }[] = []
    const regex = /<thinking>([\s\S]*?)<\/thinking>/g
    let lastIndex = 0
    let match

    while ((match = regex.exec(content)) !== null) {
      // Text before this thinking block
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: content.slice(lastIndex, match.index) })
      }
      parts.push({ type: 'thinking', content: match[1].trim() })
      lastIndex = match.index + match[0].length
    }

    // Opening <thinking> without closing </thinking> — still streaming
    if (lastIndex < content.length) {
      const remaining = content.slice(lastIndex)
      if (remaining.includes('<thinking>') && !remaining.includes('</thinking>')) {
        // Partial thinking block still streaming — render as thinking
        const thinkStart = remaining.indexOf('<thinking>')
        if (thinkStart > 0) {
          parts.push({ type: 'text', content: remaining.slice(0, thinkStart) })
        }
        parts.push({ type: 'thinking', content: remaining.slice(thinkStart + 10).trim() })
      } else {
        parts.push({ type: 'text', content: remaining })
      }
    }

    return parts
  }, [content])

  if (!content) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="animate-pulse">●</span>
        <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
        <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
      </div>
    )
  }

  return (
    <div className="text-sm prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      {segments.map((segment, i) =>
        segment.type === 'thinking' ? (
          <details key={i} className="group mb-2">
            <summary className="text-[11px] text-muted-foreground/50 cursor-pointer hover:text-muted-foreground/80 select-none mb-1 list-none flex items-center gap-1">
              <span className="inline-block transition-transform group-open:rotate-90">▶</span>
              Thinking
            </summary>
            <div className="text-xs text-muted-foreground/40 italic leading-relaxed pl-3 border-l border-muted-foreground/20">
              {segment.content}
            </div>
          </details>
        ) : (
          <MarkdownRender key={i} content={segment.content} onOpenCode={onOpenCode} />
        )
      )}
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 bg-foreground/70 animate-pulse ml-0.5 -mb-0.5" />
      )}
    </div>
  )
}

function MarkdownRender({
  content,
  onOpenCode,
}: {
  content: string
  onOpenCode?: (codeBlock: CodeBlock) => void
}) {
  if (!content.trim()) return null
  return (
    <ReactMarkdown
      components={{
        pre({ children }) {
          const childrenArray = Array.isArray(children) ? children : [children]
          const hasLanguageCode = childrenArray.some(
            (child) =>
              isValidElement(child) &&
              child.type === 'code' &&
              child.props &&
              typeof child.props.className === 'string' &&
              /language-\w+/.test(child.props.className)
          )

          if (hasLanguageCode) {
            return <div className="max-w-full overflow-x-auto my-2">{children}</div>
          }

          return (
            <pre className="overflow-x-auto max-w-full bg-muted/60 p-3 rounded-lg my-2 font-mono text-[12.5px] text-foreground border border-border/40 whitespace-pre">
              {children}
            </pre>
          )
        },
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          const codeString = String(children).replace(/\n$/, '')

          if (match) {
            return (
              <CodeBlockRenderer
                language={match[1]}
                code={codeString}
                onOpenCode={onOpenCode}
              />
            )
          }

          return (
            <code
              className="bg-muted/50 px-1.5 py-0.5 rounded text-[13px] font-mono break-words whitespace-pre-wrap"
              {...props}
            >
              {children}
            </code>
          )
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0 leading-relaxed break-words">{children}</p>
        },
        ul({ children }) {
          return <ul className="mb-2 list-disc pl-4 space-y-1">{children}</ul>
        },
        ol({ children }) {
          return <ol className="mb-2 list-decimal pl-4 space-y-1">{children}</ol>
        },
        h1({ children }) {
          return <h1 className="text-lg font-bold mb-2 mt-4 break-words">{children}</h1>
        },
        h2({ children }) {
          return <h2 className="text-base font-bold mb-2 mt-3 break-words">{children}</h2>
        },
        h3({ children }) {
          return <h3 className="text-sm font-bold mb-1 mt-2 break-words">{children}</h3>
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-primary/30 pl-3 my-2 italic text-muted-foreground break-words">
              {children}
            </blockquote>
          )
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-2">
              <table className="text-xs border-collapse">{children}</table>
            </div>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function CodeBlockRenderer({
  language,
  code,
  onOpenCode,
}: {
  language: string
  code: string
  onOpenCode?: (codeBlock: CodeBlock) => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  const handleOpenInEditor = useCallback(() => {
    onOpenCode?.({
      id: `cb-${Date.now()}`,
      language,
      code,
    })
  }, [language, code, onOpenCode])

  const filenameMatch = code.match(/\/\/\s*(?:filepath|file):\s*(.+)/)
  const filename = filenameMatch?.[1]?.trim()

  return (
    <div className="my-3 rounded-lg overflow-hidden border bg-[#282c34] not-prose">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#21252b] border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/50 font-mono">{language}</span>
          {filename && (
            <span className="text-[11px] text-emerald-400/70 font-mono">{filename}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleOpenInEditor}
            className="text-white/40 hover:text-white/80 transition-colors p-1 rounded"
            title="Open in Editor"
          >
            <Code2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleCopy}
            className="text-white/40 hover:text-white/80 transition-colors p-1 rounded"
            title="Copy code"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
      {/* Code */}
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '12px 16px',
          fontSize: '12px',
          lineHeight: '1.5',
          background: 'transparent',
          overflowX: 'auto',
        }}
        codeTagProps={{
          style: { fontFamily: 'var(--font-geist-mono), monospace' },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
