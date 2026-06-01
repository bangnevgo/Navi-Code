'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { useChatStore, type ChatMessage, type CodeBlock } from '@/stores/chat-store'
import { useEditorStore } from '@/stores/editor-store'
import { ChatMessage as ChatMessageComponent } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Sparkles, MessageSquarePlus, Trash2 } from 'lucide-react'

export function ChatPanel() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const {
    conversations,
    activeConversationId,
    isStreaming,
    selectedModel,
    createConversation,
    deleteConversation,
    setActiveConversation,
    addMessage,
    updateMessage,
    appendToMessage,
    setStreaming,
    getActiveConversation,
  } = useChatStore()
  const { openFile } = useEditorStore()

  const activeConversation = getActiveConversation()

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [activeConversation?.messages])

  const handleSendMessage = useCallback(
    async (content: string) => {
      let convId = activeConversationId
      if (!convId) {
        convId = createConversation()
      }

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      }
      addMessage(convId, userMessage)

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        model: selectedModel,
        isStreaming: true,
      }
      addMessage(convId, assistantMessage)
      setStreaming(true)

      try {
        const conv = useChatStore.getState().conversations.find((c) => c.id === convId)
        const messages = conv?.messages
          .filter((m) => m.role !== 'system' && m.id !== assistantMessage.id)
          .map((m) => ({ role: m.role, content: m.content })) || []

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, model: selectedModel }),
        })

        if (!response.ok) throw new Error('Failed to get response')

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No reader available')

        const decoder = new TextDecoder()
        let fullContent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          fullContent += chunk
          updateMessage(convId!, assistantMessage.id, {
            content: fullContent,
            isStreaming: true,
          })
        }

        const codeBlocks = extractCodeBlocks(fullContent)
        updateMessage(convId!, assistantMessage.id, {
          content: fullContent,
          isStreaming: false,
          codeBlocks,
        })
      } catch (error) {
        console.error('Error sending message:', error)
        updateMessage(convId!, assistantMessage.id, {
          content: 'Sorry, an error occurred while generating the response. Please try again.',
          isStreaming: false,
        })
      } finally {
        setStreaming(false)
      }
    },
    [activeConversationId, selectedModel, createConversation, addMessage, updateMessage, setStreaming]
  )

  const handleOpenCode = useCallback(
    (codeBlock: CodeBlock) => {
      openFile({
        name: codeBlock.filename || `untitled.${getExtension(codeBlock.language)}`,
        path: codeBlock.filename || `/generated/${codeBlock.language}-${Date.now()}.${getExtension(codeBlock.language)}`,
        content: codeBlock.code,
        language: codeBlock.language,
      })
    },
    [openFile]
  )

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">ZCode Chat</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {selectedModel}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => createConversation()} title="New Chat">
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </div>

      {/* Conversation Tabs */}
      {conversations.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-muted/20 overflow-x-auto">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs cursor-pointer whitespace-nowrap transition-colors ${
                conv.id === activeConversationId
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted text-muted-foreground'
              }`}
              onClick={() => setActiveConversation(conv.id)}
            >
              <span>{conv.title}</span>
              <button
                className="ml-1 opacity-60 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteConversation(conv.id)
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-4 space-y-4">
          {!activeConversation || activeConversation.messages.length === 0 ? (
            <EmptyState />
          ) : (
            activeConversation.messages.map((message) => (
              <ChatMessageComponent
                key={message.id}
                message={message}
                onOpenCode={handleOpenCode}
              />
            ))
          )}
          {isStreaming && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm pl-11">
              <div className="flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>●</span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>●</span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>●</span>
              </div>
              <span>Thinking...</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <ChatInput onSend={handleSendMessage} disabled={isStreaming} />
    </div>
  )
}

function EmptyState() {
  const suggestions = [
    { icon: '🔧', text: 'Build a REST API with Express.js', prompt: 'Build a REST API with Express.js that has CRUD endpoints for a todo app' },
    { icon: '🎨', text: 'Create a React component', prompt: 'Create a reusable React component for a data table with sorting and filtering' },
    { icon: '🐛', text: 'Debug my code', prompt: 'I have a bug in my code. Can you help me debug it?' },
    { icon: '📐', text: 'Design system architecture', prompt: 'Design a microservices architecture for an e-commerce platform' },
  ]

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Sparkles className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Welcome to ZCode</h3>
      <p className="text-sm text-muted-foreground text-center mb-8 max-w-md">
        Your AI-powered coding assistant. Ask me to write code, debug, refactor, or explain anything.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
        {suggestions.map((s, i) => (
          <button
            key={i}
            className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition-colors text-left"
            onClick={() => {
              const store = useChatStore.getState()
              let convId = store.activeConversationId
              if (!convId) {
                convId = store.createConversation()
              }
              // Simulate sending
              const event = new CustomEvent('zcode-send', { detail: s.prompt })
              window.dispatchEvent(event)
            }}
          >
            <span className="text-lg">{s.icon}</span>
            <span className="text-xs text-muted-foreground">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const regex = /```(\w+)?\n([\s\S]*?)```/g
  let match
  while ((match = regex.exec(content)) !== null) {
    const language = match[1] || 'text'
    const code = match[2].trim()
    const filenameMatch = code.match(/\/\/\s*(?:filepath|file):\s*(.+)/)
    blocks.push({
      id: `cb-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      language,
      code,
      filename: filenameMatch?.[1]?.trim(),
    })
  }
  return blocks
}

function getExtension(language: string): string {
  const map: Record<string, string> = {
    typescript: 'ts',
    javascript: 'js',
    tsx: 'tsx',
    jsx: 'jsx',
    python: 'py',
    rust: 'rs',
    go: 'go',
    java: 'java',
    css: 'css',
    html: 'html',
    json: 'json',
    markdown: 'md',
    sql: 'sql',
    bash: 'sh',
    shell: 'sh',
    yaml: 'yml',
    toml: 'toml',
  }
  return map[language] || language
}
