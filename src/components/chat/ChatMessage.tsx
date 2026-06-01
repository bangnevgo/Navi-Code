'use client'

import { useMemo } from 'react'
import type { ChatMessage as ChatMessageType, CodeBlock } from '@/stores/chat-store'
import { useEditorStore } from '@/stores/editor-store'
import { Button } from '@/components/ui/button'
import { Copy, Code2, Check, User, Bot } from 'lucide-react'
import { useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface ChatMessageProps {
  message: ChatMessageType
  onOpenCode?: (codeBlock: CodeBlock) => void
}

export function ChatMessage({ message, onOpenCode }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-emerald-500/10 text-emerald-600'
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div className={`flex-1 max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block text-left rounded-2xl px-4 py-2.5 ${
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted rounded-tl-sm'
          }`}
        >
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            <MessageContent
              content={message.content}
              isStreaming={message.isStreaming}
              onOpenCode={onOpenCode}
            />
          )}
        </div>
        <div className={`mt-1 text-[10px] text-muted-foreground ${isUser ? 'text-right' : ''}`}>
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
          {message.model && (
            <span className="ml-2 opacity-60">{message.model}</span>
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
      <ReactMarkdown
        components={{
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
                className="bg-muted/50 px-1.5 py-0.5 rounded text-[13px] font-mono"
                {...props}
              >
                {children}
              </code>
            )
          },
          p({ children }) {
            return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
          },
          ul({ children }) {
            return <ul className="mb-2 list-disc pl-4 space-y-1">{children}</ul>
          },
          ol({ children }) {
            return <ol className="mb-2 list-decimal pl-4 space-y-1">{children}</ol>
          },
          h1({ children }) {
            return <h1 className="text-lg font-bold mb-2 mt-4">{children}</h1>
          },
          h2({ children }) {
            return <h2 className="text-base font-bold mb-2 mt-3">{children}</h2>
          },
          h3({ children }) {
            return <h3 className="text-sm font-bold mb-1 mt-2">{children}</h3>
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-primary/30 pl-3 my-2 italic text-muted-foreground">
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
      />
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 bg-foreground/70 animate-pulse ml-0.5 -mb-0.5" />
      )}
    </div>
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
