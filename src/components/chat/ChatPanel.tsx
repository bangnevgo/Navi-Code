'use client'

import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { useChatStore, type ChatMessage, type CodeBlock } from '@/stores/chat-store'
import { useEditorStore } from '@/stores/editor-store'
import { useProviderStore } from '@/stores/provider-store'
import { useSkillStore } from '@/stores/skill-store'
import { ChatMessage as ChatMessageComponent } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Sparkles, MessageSquarePlus, Trash2, ChevronDown, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

export function ChatPanel() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const {
    conversations,
    activeConversationId,
    isStreaming,
    createConversation,
    deleteConversation,
    setActiveConversation,
    addMessage,
    updateMessage,
    setStreaming,
    getActiveConversation,
  } = useChatStore()
  const { openFile } = useEditorStore()
  const { getActiveProvider, selectedModel, setSelectedModel } = useProviderStore()
  const { getEnabledSkills } = useSkillStore()

  const activeConversation = getActiveConversation()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null
      if (viewport) {
        requestAnimationFrame(() => {
          viewport.scrollTop = viewport.scrollHeight
        })
      }
    }
  }, [activeConversation?.messages])

  const executeAgentTurn = useCallback(
    async (convId: string) => {
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
          .filter((m) => m.role !== 'system' && m.id !== assistantMessage.id && m.content.trim() !== '')
          .map((m) => ({ role: m.role, content: m.content })) || []

        // Get provider config
        const activeProvider = getActiveProvider()
        const providerPayload = activeProvider && activeProvider.type !== 'builtin'
          ? {
              id: activeProvider.id,
              name: activeProvider.name,
              baseUrl: activeProvider.baseUrl,
              apiKey: activeProvider.id === 'fcc-proxy' && !activeProvider.apiKey ? 'freecc' : activeProvider.apiKey,
              type: activeProvider.type,
              headers: activeProvider.headers,
              apiFormat: activeProvider.apiFormat,
            }
          : undefined

        // Get enabled skills
        const enabledSkills = getEnabledSkills().map((s) => s.id)

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 120000)

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages,
            model: selectedModel,
            provider: providerPayload,
            enabledSkills,
          }),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Failed to get response' }))
          throw new Error(errorData.error || `HTTP ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No reader available')

        const decoder = new TextDecoder()
        let fullContent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          fullContent += chunk
          updateMessage(convId, assistantMessage.id, {
            content: fullContent,
            isStreaming: true,
          })
        }

        // Extract code blocks for open-in-editor feature
        const codeBlocks = extractCodeBlocks(fullContent)

        // Estimate token usage
        const totalInputChars = messages.reduce((acc, m) => acc + m.content.length, 0)
        const tokensIn = Math.round(totalInputChars / 4)
        const tokensOut = Math.round(fullContent.length / 4)

        let cost = 0
        const activeModel = selectedModel.toLowerCase()
        if (activeModel.includes('free') || activeModel.includes('owl-alpha')) {
          cost = 0
        } else if (activeModel.includes('opus')) {
          cost = (tokensIn * 15 + tokensOut * 75) / 1000000
        } else if (activeModel.includes('sonnet') || activeModel.includes('glm-4-plus')) {
          cost = (tokensIn * 3 + tokensOut * 15) / 1000000
        } else if (activeModel.includes('haiku') || activeModel.includes('flash') || activeModel.includes('mini')) {
          cost = (tokensIn * 0.25 + tokensOut * 1.25) / 1000000
        } else {
          cost = (tokensIn * 1 + tokensOut * 3) / 1000000
        }

        updateMessage(convId, assistantMessage.id, {
          content: fullContent,
          isStreaming: false,
          codeBlocks,
          tokensIn,
          tokensOut,
          cost,
        })
      } catch (error) {
        console.error('Error in agent turn:', error)
        updateMessage(convId, assistantMessage.id, {
          content: `Sorry, an error occurred: ${error instanceof Error ? error.message : 'Unknown error'}. Please check your API key and provider settings.`,
          isStreaming: false,
        })
      } finally {
        setStreaming(false)
      }
    },
    [selectedModel, addMessage, setStreaming, getActiveProvider, getEnabledSkills, updateMessage]
  )

  const handleCostCommand = useCallback((convId: string) => {
    const conv = useChatStore.getState().conversations.find((c) => c.id === convId)
    if (!conv) return
    let totalIn = 0
    let totalOut = 0
    let totalCost = 0
    conv.messages.forEach(m => {
      if (m.tokensIn) totalIn += m.tokensIn
      if (m.tokensOut) totalOut += m.tokensOut
      if (m.cost) totalCost += m.cost
    })

    const costMessage: ChatMessage = {
      id: `msg-${Date.now()}-cost`,
      role: 'assistant',
      content: `### 📊 NaviCode Session Token & Cost Usage\n\n- **Estimated Cost**: $${totalCost.toFixed(5)}\n- **Tokens Sent (In)**: ${totalIn.toLocaleString()}\n- **Tokens Received (Out)**: ${totalOut.toLocaleString()}\n- **Total Tokens**: ${(totalIn + totalOut).toLocaleString()}\n\n*Note: Cost calculation is estimated based on the pricing of the active model.*`,
      timestamp: Date.now(),
      model: selectedModel,
    }
    addMessage(convId, costMessage)
  }, [addMessage, selectedModel])

  const handleCompactCommand = useCallback((convId: string) => {
    const conv = useChatStore.getState().conversations.find((c) => c.id === convId)
    if (!conv || conv.messages.length <= 4) {
      const msg: ChatMessage = {
        id: `msg-${Date.now()}-compact`,
        role: 'assistant',
        content: `Conversation is already compact (contains ${conv?.messages.length || 0} messages). No compaction needed.`,
        timestamp: Date.now(),
        model: selectedModel,
      }
      addMessage(convId, msg)
      return
    }

    const numRemoved = conv.messages.length - 4
    const keptMessages = conv.messages.slice(-4)
    useChatStore.getState().setMessages(convId, keptMessages)

    const compactMessage: ChatMessage = {
      id: `msg-${Date.now()}-compact`,
      role: 'assistant',
      content: `🧹 **Conversation compacted!** Removed ${numRemoved} messages from context.`,
      timestamp: Date.now(),
      model: selectedModel,
    }
    addMessage(convId, compactMessage)
  }, [addMessage, selectedModel])

  const handleSendMessage = useCallback(
    async (content: string) => {
      let convId = activeConversationId
      if (!convId) {
        convId = createConversation()
      }

      const trimmed = content.trim()
      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      }
      addMessage(convId, userMessage)

      if (trimmed.startsWith('/')) {
        const parts = trimmed.split(' ')
        const command = parts[0].toLowerCase().slice(1)

        if (command === 'cost') {
          handleCostCommand(convId)
          return
        }
        if (command === 'compact') {
          handleCompactCommand(convId)
          return
        }
      }

      await executeAgentTurn(convId)
    },
    [activeConversationId, createConversation, addMessage, executeAgentTurn, handleCostCommand, handleCompactCommand]
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

  const handleCommand = useCallback(async (cmd: string) => {
    switch (cmd) {
      case 'new':
        createConversation()
        break
      case 'clear':
        deleteConversation(activeConversationId || '')
        createConversation()
        break
      case 'retry':
        const conv = getActiveConversation()
        if (!conv || isStreaming) break
        const lastUserMsg = [...conv.messages].reverse().find(m => m.role === 'user')
        if (!lastUserMsg) break
        const lastAssistantMsgs = conv.messages.filter(m => m.role === 'assistant')
        const lastAssistant = lastAssistantMsgs[lastAssistantMsgs.length - 1]
        if (lastAssistant) {
          updateMessage(conv.id, lastAssistant.id, { content: '' })
        }
        await executeAgentTurn(conv.id)
        break
      case 'help':
        handleSendMessage('/help')
        break
    }
  }, [createConversation, deleteConversation, getActiveConversation, updateMessage, handleSendMessage, executeAgentTurn, isStreaming, activeConversationId])

  const activeProvider = mounted ? getActiveProvider() : undefined
  const availableModels = activeProvider ? activeProvider.models : []

  const groupedModels = useMemo(() => {
    const groups: Record<string, string[]> = {}
    availableModels.forEach((m) => {
      const parts = m.split('/')
      let category = 'Others'
      if (parts.length >= 3 && parts[0] === 'anthropic') {
        category = parts[1].toUpperCase().replace('_', ' ')
      } else if (parts.length >= 2) {
        category = parts[0].toUpperCase().replace('_', ' ')
      }
      if (!groups[category]) groups[category] = []
      groups[category].push(m)
    })
    return groups
  }, [availableModels])

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">NaviCode Chat</span>
          {mounted && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/60 hover:bg-muted hover:text-foreground px-2 py-0.5 rounded-full transition-colors font-medium border border-transparent hover:border-muted-foreground/10"
                  suppressHydrationWarning
                >
                  <span className="truncate max-w-[200px]">
                    {selectedModel.replace('anthropic/', '')}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60 flex-shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search AI model..." className="h-9" />
                  <CommandList className="max-h-[300px] overflow-y-auto">
                    <CommandEmpty>No model found.</CommandEmpty>
                    {Object.entries(groupedModels).map(([category, models]) => (
                      <CommandGroup key={category} heading={category}>
                        {models.map((model) => (
                          <CommandItem
                            key={model}
                            value={model}
                            onSelect={(val) => {
                              setSelectedModel(val)
                            }}
                            className="flex items-center justify-between text-xs cursor-pointer py-1.5 px-2"
                          >
                            <span className="truncate max-w-[220px]">
                              {model.replace('anthropic/', '')}
                            </span>
                            {selectedModel === model && (
                              <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
          {mounted && activeProvider && activeProvider.type !== 'builtin' && (
            <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full">
              {activeProvider.icon} {activeProvider.name}
            </span>
          )}
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
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
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
      </div>

      {/* Input */}
      <ChatInput onSend={handleSendMessage} onCommand={handleCommand} disabled={isStreaming} />
    </div>
  )
}

function EmptyState() {
  const suggestions = [
    { icon: '🔧', text: 'Build a REST API', prompt: 'Build a REST API with Express.js that has CRUD endpoints for a todo app' },
    { icon: '🎨', text: 'Create a component', prompt: 'Create a reusable React component for a data table with sorting and filtering' },
    { icon: '🖥️', text: 'Run a command', prompt: 'List all files in my project directory using the terminal' },
    { icon: '🔍', text: 'Search the web', prompt: 'Search the web for the latest Next.js 15 features' },
  ]

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Sparkles className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Welcome to NaviCode</h3>
      <p className="text-sm text-muted-foreground text-center mb-8 max-w-md">
        Your AI-powered coding assistant with local computer access. Ask me to write code, run commands, search files, and more.
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
              const event = new CustomEvent('navicode-send', { detail: s.prompt })
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
    typescript: 'ts', javascript: 'js', tsx: 'tsx', jsx: 'jsx',
    python: 'py', rust: 'rs', go: 'go', java: 'java',
    css: 'css', html: 'html', json: 'json', markdown: 'md',
    sql: 'sql', bash: 'sh', shell: 'sh', yaml: 'yml', toml: 'toml',
  }
  return map[language] || language
}
