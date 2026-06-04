'use client'

import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { useChatStore, type ChatMessage, type CodeBlock } from '@/stores/chat-store'
import { useEditorStore } from '@/stores/editor-store'
import { useProviderStore } from '@/stores/provider-store'
import { useSkillStore, AVAILABLE_SKILLS } from '@/stores/skill-store'
import { ChatMessage as ChatMessageComponent } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Sparkles, MessageSquarePlus, Trash2, ChevronDown, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

const toolToSkillIdMap: Record<string, string> = {
  file_read: 'file-read',
  file_write: 'file-write',
  file_list: 'file-list',
  file_delete: 'file-delete',
  file_search: 'file-search',
  terminal_exec: 'terminal-exec',
  web_search: 'web-search',
  web_scrape: 'web-scrape',
  system_info: 'system-info',
}

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
  const { openFile, addTerminalLine } = useEditorStore()
  const { getActiveProvider, selectedModel, setSelectedModel } = useProviderStore()
  const { getEnabledSkills, addSkillCall, updateSkillCall, activeSkillCalls } = useSkillStore()

  const activeConversation = getActiveConversation()
  const [mounted, setMounted] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    toolName: string
    input: Record<string, unknown>
    callId: string
  } | null>(null)
  const pendingConfirmationRef = useRef<((approved: boolean) => void) | null>(null)
  const [pendingQuestion, setPendingQuestion] = useState<{
    question: string
    options: string[]
    callId: string
  } | null>(null)
  const pendingQuestionRef = useRef<((answer: string) => void) | null>(null)
  const runningSkillCalls = mounted ? activeSkillCalls.filter((c) => c.status === 'running') : []

  const handleConfirmApprove = useCallback(() => {
    if (pendingConfirmationRef.current) {
      pendingConfirmationRef.current(true)
    }
  }, [])

  const handleConfirmReject = useCallback(() => {
    if (pendingConfirmationRef.current) {
      pendingConfirmationRef.current(false)
    }
  }, [])

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

  const executeToolCall = useCallback(
    async (toolName: string, input: Record<string, unknown>) => {
      const skillId = toolToSkillIdMap[toolName] || toolName
      const skill = AVAILABLE_SKILLS.find((s) => s.id === skillId)
      const requiresConfirmation = skill?.requiresConfirmation ?? false

      const callId = addSkillCall({
        skillId,
        skillName: toolName,
        input: JSON.stringify(input),
        status: requiresConfirmation ? 'awaiting-confirmation' : 'running',
      })

      if (requiresConfirmation) {
        setPendingConfirmation({ toolName, input, callId })
        const approved = await new Promise<boolean>((resolve) => {
          pendingConfirmationRef.current = resolve
        })
        setPendingConfirmation(null)
        pendingConfirmationRef.current = null

        if (!approved) {
          updateSkillCall(callId, {
            status: 'error',
            error: 'Operation rejected by the user.',
            output: 'Operation rejected by the user.',
          })
          return 'Error: Operation rejected by the user.'
        }

        updateSkillCall(callId, { status: 'running' })
      }

      try {
        if (toolName === 'ask_question') {
          const question = (input.question as string) || ''
          const options = (input.options as string[]) || []
          setPendingQuestion({ question, options, callId })
          
          const answer = await new Promise<string>((resolve) => {
            pendingQuestionRef.current = resolve
          })
          
          setPendingQuestion(null)
          pendingQuestionRef.current = null
          
          updateSkillCall(callId, {
            status: 'completed',
            output: `User answered: "${answer}"`,
          })
          return `User answered: "${answer}"`
        }

        if (toolName === 'start_subagent') {
          const subagentName = (input.name as string) || 'subagent'
          const subagentPrompt = (input.prompt as string) || ''
          
          updateSkillCall(callId, {
            status: 'running',
            output: `Spawning subagent [${subagentName}]...`
          })
          
          const provider = getActiveProvider()
          const enabledSkills = getEnabledSkills().map(s => s.id)
          
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [{ role: 'user', content: subagentPrompt }],
              model: selectedModel,
              provider,
              enabledSkills,
              systemPromptOverride: `You are a specialized subagent named "${subagentName}" working under the supervision of the main NaviCode agent.
Your specific subtask instructions are: "${subagentPrompt}".
Execute this task completely and output the final findings or code. Limit your output to direct conclusions/code files created.`
            }),
          })
          
          if (!response.ok) {
            const errText = await response.text()
            throw new Error(`HTTP error ${response.status}: ${errText}`)
          }
          
          const reader = response.body?.getReader()
          if (!reader) throw new Error('No streaming reader available')
          
          let resultText = ''
          const decoder = new TextDecoder()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            resultText += decoder.decode(value)
          }
          
          updateSkillCall(callId, {
            status: 'completed',
            output: resultText,
          })
          return `Subagent [${subagentName}] completed task successfully. Output findings:\n${resultText}`
        }

        const cwd = useEditorStore.getState().getCwd();
        const enrichedInput = { ...input, cwd };
        
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 60000) // 60s timeout

        const response = await fetch('/api/tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool: toolName, input: enrichedInput }),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        const result = await response.json()

        if (result.success) {
          updateSkillCall(callId, {
            status: 'completed',
            output: typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2),
          })
          return typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2)
        } else {
          updateSkillCall(callId, {
            status: 'error',
            error: result.error || 'Unknown error',
            output: result.error || 'Unknown error',
          })
          return `Error: ${result.error}`
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error'
        updateSkillCall(callId, { status: 'error', error: msg, output: msg })
        return `Error: ${msg}`
      }
    },
    [addSkillCall, updateSkillCall, getActiveProvider, selectedModel, getEnabledSkills]
  )

  const extractAndExecuteTools = useCallback(
    async (content: string, convId: string, messageId: string): Promise<string> => {
      const toolRegex = /```(?:tool|json)?\s*\n([\s\S]*?)```/gi
      let match
      let newContent = content
      const toolCalls: { original: string; tool?: string; input?: any; error?: string }[] = []

      while ((match = toolRegex.exec(content)) !== null) {
        const original = match[0]
        const rawJson = match[1].trim()
        try {
          const toolCall = JSON.parse(rawJson)
          if (toolCall && typeof toolCall === 'object' && 'tool' in toolCall && 'input' in toolCall) {
            toolCalls.push({ original, tool: toolCall.tool, input: toolCall.input })
          }
        } catch (err) {
          const isExplicitToolTag = original.toLowerCase().startsWith('```tool')
          const looksLikeToolCall = rawJson.includes('"tool"') && rawJson.includes('"input"')

          if (isExplicitToolTag || looksLikeToolCall) {
            // Attempt to fix simple JSON formatting errors
            try {
              const cleaned = rawJson
                .replace(/,\s*([\]}])/g, '$1') // Remove trailing commas
                .replace(/'([^']*)'\s*:/g, '"$1":') // Replace single quotes in keys
                .replace(/:\s*'([^']*)'/g, ':"$1"') // Replace single quotes in values
              const toolCall = JSON.parse(cleaned)
              if (toolCall && typeof toolCall === 'object' && 'tool' in toolCall && 'input' in toolCall) {
                toolCalls.push({ original, tool: toolCall.tool, input: toolCall.input })
                continue
              }
            } catch {}

            const errMsg = err instanceof Error ? err.message : 'Unknown JSON parse error'
            toolCalls.push({ original, error: `Invalid JSON format: ${errMsg}. Make sure to use double quotes and do not use trailing commas.` })
          }
        }
      }

      if (toolCalls.length > 0) {
        // Execute sequentially to preserve order and prevent filesystem race conditions
        for (const call of toolCalls) {
          let result = ''
          if (call.error) {
            result = `Error: ${call.error}`
          } else if (call.tool && call.input) {
            result = await executeToolCall(call.tool, call.input)
          }

          newContent = newContent.replace(
            call.original,
            `\n\n**Tool Result:**\n\`\`\`\n${result}\n\`\`\`\n`
          )
        }
        updateMessage(convId, messageId, { content: newContent })
      }

      return newContent
    },
    [executeToolCall, updateMessage]
  )

  const executeAgentTurn = useCallback(
    async (convId: string, depth = 0) => {
      if (depth > 5) {
        console.warn('Max agent loop depth reached')
        return
      }

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

        // Get provider config — force default apiKey for FCC proxy if empty
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
        const timeoutId = setTimeout(() => controller.abort(), 90000) // 90s timeout for chat completion

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

        // Execute any tool calls in the response
        const processedContent = await extractAndExecuteTools(fullContent, convId, assistantMessage.id)

        const codeBlocks = extractCodeBlocks(processedContent)

        // Calculate tokens and cost metrics
        const totalInputChars = messages.reduce((acc, m) => acc + m.content.length, 0)
        const tokensIn = Math.round(totalInputChars / 4)
        const tokensOut = Math.round(processedContent.length / 4)
        
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
          content: processedContent,
          isStreaming: false,
          codeBlocks,
          tokensIn,
          tokensOut,
          cost,
        })

        // If a tool call was executed (processedContent differs from fullContent), trigger the next turn
        if (processedContent !== fullContent) {
          // Add a short delay to feel natural
          await new Promise((resolve) => setTimeout(resolve, 800))
          await executeAgentTurn(convId, depth + 1)
        }
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
    [selectedModel, addMessage, setStreaming, getActiveProvider, getEnabledSkills, updateMessage, extractAndExecuteTools]
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
    
    // Update the conversation's messages using the setMessages action
    useChatStore.getState().setMessages(convId, keptMessages)
    
    const compactMessage: ChatMessage = {
      id: `msg-${Date.now()}-compact`,
      role: 'assistant',
      content: `🧹 **Conversation compacted!** Removed ${numRemoved} messages from context to free up the active memory buffer. Only the last 4 messages are retained.`,
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

      // Intercept local CLI client commands
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

      await executeAgentTurn(convId, 0)
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
      case 'clear': {
        const conv = getActiveConversation()
        if (conv && conv.messages.length > 0) {
          // Find and clear messages
          const msgs = [...conv.messages]
          msgs.forEach(m => {
            try { updateMessage(conv.id, m.id, { content: '' }) } catch {}
          })
          // Instead, just delete and recreate
          deleteConversation(conv.id)
          createConversation()
        }
        break
      }
      case 'retry': {
        const conv = getActiveConversation()
        if (!conv || isStreaming) break
        const msgs = conv.messages
        // Find the last assistant message
        const lastAssistantIdx = msgs.length - 1
        if (lastAssistantIdx < 0 || msgs[lastAssistantIdx].role !== 'assistant') break
        // Find the user message before it
        const lastUserMsg = [...msgs].reverse().find(m => m.role === 'user')
        if (!lastUserMsg) break
        // Remove the assistant message
        updateMessage(conv.id, msgs[lastAssistantIdx].id, { content: '' })
        // Re-run the agent turn
        await executeAgentTurn(conv.id, 0)
        break
      }
      case 'help':
        handleSendMessage('/help')
        break
      case 'settings':
        handleSendMessage('/settings')
        break
    }
  }, [createConversation, deleteConversation, getActiveConversation, updateMessage, handleSendMessage, executeAgentTurn, isStreaming])

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
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
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
                              setPopoverOpen(false)
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

      {/* Messages - wrapped in min-h-0 overflow-hidden to constrain ScrollArea */}
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
            {runningSkillCalls.map((call) => (
              <div key={call.id} className="flex items-center gap-2 text-emerald-500 text-xs pl-11 py-1 animate-pulse">
                <span className="animate-spin h-3 w-3 border-2 border-emerald-500 border-t-transparent rounded-full" />
                <span>Running tool: <strong className="font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">{call.skillName}</strong>...</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Confirmation Banner */}
      {pendingConfirmation && (
        <div className="border-t bg-amber-500/10 border-amber-500/20 p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex flex-col gap-3 max-w-3xl mx-auto">
            <div className="flex items-center gap-2 text-amber-500">
              <span className="text-lg">⚠️</span>
              <span className="font-semibold text-sm">Aksi ini memerlukan konfirmasi Anda (Confirmation Required)</span>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 border border-border/50 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
              <span className="text-muted-foreground">Tool:</span> <span className="text-foreground font-bold">{pendingConfirmation.toolName}</span>{"\n"}
              <span className="text-muted-foreground">Parameter:</span>{"\n"}
              {JSON.stringify(pendingConfirmation.input, null, 2)}
            </div>
            <div className="flex items-center gap-2 self-end">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleConfirmReject()}
                className="text-xs"
              >
                Reject (Tolak)
              </Button>
              <Button 
                variant="default" 
                size="sm" 
                onClick={() => handleConfirmApprove()}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs border-none animate-pulse"
              >
                Approve (Izinkan)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Question Banner */}
      {pendingQuestion && (
        <div className="border-t bg-primary/10 border-primary/20 p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex flex-col gap-3 max-w-3xl mx-auto">
            <div className="flex items-center gap-2 text-primary">
              <span className="text-lg">❓</span>
              <span className="font-semibold text-sm">Masukan Diperlukan (Feedback / Input Required)</span>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 border border-border/50 text-sm font-medium text-foreground">
              {pendingQuestion.question}
            </div>
            {pendingQuestion.options && pendingQuestion.options.length > 0 ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  {pendingQuestion.options.map((opt) => (
                    <Button
                      key={opt}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        if (pendingQuestionRef.current) {
                          pendingQuestionRef.current(opt)
                        }
                      }}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2 items-center mt-1 border-t pt-2">
                  <input
                    id="custom-answer-input"
                    type="text"
                    placeholder="Atau ketik jawaban Anda..."
                    className="flex-1 bg-background border border-input rounded-md px-3 py-1 text-xs h-8 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = e.currentTarget.value.trim()
                        if (val && pendingQuestionRef.current) {
                          pendingQuestionRef.current(val)
                        }
                      }
                    }}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 text-xs px-3"
                    onClick={() => {
                      const inputEl = document.getElementById('custom-answer-input') as HTMLInputElement
                      const val = inputEl?.value.trim()
                      if (val && pendingQuestionRef.current) {
                        pendingQuestionRef.current(val)
                      }
                    }}
                  >
                    Kirim Custom
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 items-center">
                <input
                  id="custom-answer-input"
                  type="text"
                  placeholder="Ketik jawaban Anda di sini..."
                  className="flex-1 bg-background border border-input rounded-md px-3 py-1 text-xs h-8 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = e.currentTarget.value.trim()
                      if (val && pendingQuestionRef.current) {
                        pendingQuestionRef.current(val)
                      }
                    }
                  }}
                />
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 text-xs px-3"
                  onClick={() => {
                    const inputEl = document.getElementById('custom-answer-input') as HTMLInputElement
                    const val = inputEl?.value.trim()
                    if (val && pendingQuestionRef.current) {
                      pendingQuestionRef.current(val)
                    }
                  }}
                >
                  Kirim (Send)
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input */}
      <ChatInput onSend={handleSendMessage} onCommand={handleCommand} disabled={isStreaming || !!pendingConfirmation || !!pendingQuestion} />
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
    if (language === 'tool') continue // Skip tool blocks
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
