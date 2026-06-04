'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Send, Paperclip, Square, FileText, FileCode, Terminal, Globe, Search,
  Monitor, HelpCircle, Trash2, Code, GitBranch, Package, Bug, Sparkles,
  RefreshCw, DollarSign, ScanEye, FlaskConical, BookOpenText,
  GitPullRequest, GitCommitHorizontal, FilePlus, Settings, Minimize2, MessageSquarePlus,
  Shield, Wrench,
} from 'lucide-react'
import { useSkillStore } from '@/stores/skill-store'
import { useProviderStore } from '@/stores/provider-store'
import { useEditorStore } from '@/stores/editor-store'
import { cn } from '@/lib/utils'

type CommandType = 'action' | 'template'

interface SlashCommand {
  id: string
  label: string
  description: string
  icon: typeof Sparkles
  type: CommandType
  template: string
  category: string
}

interface ChatInputProps {
  onSend: (content: string) => void
  disabled?: boolean
  onCommand?: (command: string) => void
}

const SKILL_ICONS: Record<string, typeof Sparkles> = {
  'file-read': FileCode, 'file-write': FileCode, 'file-list': FileCode,
  'file-delete': FileCode, 'file-search': Search,
  'terminal-exec': Terminal, 'web-search': Globe, 'web-scrape': Globe,
  'code-analyze': Code, 'code-lint': Bug, 'system-info': Monitor,
  'git-ops': GitBranch, 'pkg-install': Package,
}

export function ChatInput({ onSend, disabled, onCommand }: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [uploadedFile, setUploadedFile] = useState<{ name: string; content: string } | null>(null)
  const [showCommands, setShowCommands] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [slashQuery, setSlashQuery] = useState('')

  const { getEnabledSkills } = useSkillStore()

  // ── Claude Code slash commands, fully cloned ──
  const claudeCommands: SlashCommand[] = useMemo(() => [
    // 🗨️ Chat
    { id: 'new',         label: 'new',         description: 'Start a new conversation',                 icon: MessageSquarePlus, type: 'action',   template: '/new',         category: 'Chat' },
    { id: 'model',       label: 'model',       description: 'Switch AI model (e.g. /model minimax)',    icon: Sparkles,          type: 'template', template: '/model ',      category: 'Chat' },
    { id: 'clear',       label: 'clear',       description: 'Clear the current conversation',           icon: Trash2,            type: 'action',   template: '/clear',       category: 'Chat' },
    { id: 'retry',       label: 'retry',       description: 'Regenerate the last response',            icon: RefreshCw,         type: 'action',   template: '/retry',       category: 'Chat' },
    { id: 'compact',     label: 'compact',     description: 'Compact conversation to save context',    icon: Minimize2,         type: 'template', template: '/compact',     category: 'Chat' },
    { id: 'help',        label: 'help',        description: 'Show help and available commands',        icon: HelpCircle,        type: 'action',   template: '/help',        category: 'Chat' },

    // 💻 Code
    { id: 'search',      label: 'search',      description: 'Search codebase for files or content',    icon: Search,            type: 'template', template: '/search ',      category: 'Code' },
    { id: 'bug',         label: 'bug',         description: 'Search for bugs in the codebase',         icon: Bug,               type: 'template', template: '/bug ',         category: 'Code' },
    { id: 'test',        label: 'test',        description: 'Write and run tests',                     icon: FlaskConical,      type: 'template', template: '/test ',        category: 'Code' },
    { id: 'explain',     label: 'explain',     description: 'Explain selected code or a concept',      icon: BookOpenText,      type: 'template', template: '/explain ',      category: 'Code' },
    { id: 'doctor',      label: 'doctor',      description: 'Diagnose and fix issues in the project',  icon: Wrench,            type: 'template', template: '/doctor',       category: 'Code' },
    { id: 'vuln',        label: 'vuln',        description: 'Scan for security vulnerabilities',        icon: Shield,            type: 'template', template: '/vuln',        category: 'Code' },

    // 🔀 Git
    { id: 'review',      label: 'review',      description: 'Review recent git changes',               icon: GitBranch,         type: 'template', template: '/review',       category: 'Git' },
    { id: 'commit',      label: 'commit',      description: 'Create a git commit',                     icon: GitCommitHorizontal, type: 'template', template: '/commit ',      category: 'Git' },
    { id: 'pr',          label: 'pr',           description: 'Create a pull request',                  icon: GitPullRequest,    type: 'template', template: '/pr ',          category: 'Git' },

    // ⚙️ System
    { id: 'cost',        label: 'cost',        description: 'Show token usage and cost',               icon: DollarSign,        type: 'template', template: '/cost',        category: 'System' },
    { id: 'settings',    label: 'settings',    description: 'Open provider and skill settings',        icon: Settings,          type: 'action',   template: '/settings',    category: 'System' },
    { id: 'add',         label: 'add',         description: 'Add a file to the conversation context',  icon: FilePlus,          type: 'template', template: '/add ',         category: 'Files' },
  ], [])

  const skillCommands: SlashCommand[] = useMemo(() =>
    getEnabledSkills().map(s => ({
      id: s.id,
      label: s.id,
      description: s.description,
      icon: SKILL_ICONS[s.id] || Sparkles,
      type: 'template' as CommandType,
      template: `/${s.id} `,
      category: 'Skills',
    })),
    [getEnabledSkills]
  )

  const { getActiveProvider, setSelectedModel } = useProviderStore()
  const activeProvider = getActiveProvider()
  const availableModels = useMemo(() => activeProvider ? activeProvider.models : [], [activeProvider])
  const isModelMode = input.startsWith('/model ')

  // Grouped commands for display
  const groupedCommands = useMemo(() => {
    if (isModelMode) {
      const q = input.slice(7).toLowerCase()
      const filtered = availableModels.filter(m => m.toLowerCase().includes(q))
      // Limit to 50 models to prevent UI sluggishness
      const sliced = filtered.slice(0, 50)
      
      const commands: SlashCommand[] = sliced.map(m => ({
        id: `model::${m}`,
        label: m.replace('anthropic/', ''),
        description: `Switch active model to ${m}`,
        icon: Sparkles,
        type: 'action',
        template: m,
        category: 'Models'
      }))
      
      return { Models: commands }
    }

    const all: SlashCommand[] = [...claudeCommands, ...skillCommands]
    if (!slashQuery) {
      const groups: Record<string, SlashCommand[]> = {}
      for (const cmd of all) {
        if (!groups[cmd.category]) groups[cmd.category] = []
        groups[cmd.category].push(cmd)
      }
      return groups
    }
    const q = slashQuery.toLowerCase()
    const filtered = all.filter(c => c.label.toLowerCase().includes(q))
    const groups: Record<string, SlashCommand[]> = {}
    for (const cmd of filtered) {
      if (!groups[cmd.category]) groups[cmd.category] = []
      groups[cmd.category].push(cmd)
    }
    return groups
  }, [slashQuery, claudeCommands, skillCommands, isModelMode, input, availableModels])

  const flattenedFiltered = useMemo(() => {
    return Object.values(groupedCommands).flat()
  }, [groupedCommands])

  // Category display order
  const categoryOrder = ['Models', 'Chat', 'Code', 'Git', 'Files', 'Skills', 'System']

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)

    const slashMatch = val.match(/^\/(\w*)$/)
    const isModelType = val.startsWith('/model ')
    
    if (slashMatch) {
      setShowCommands(true)
      setSlashQuery(slashMatch[1])
      setSelectedIndex(0)
    } else if (isModelType) {
      setShowCommands(true)
      setSlashQuery(val.slice(7))
      setSelectedIndex(0)
    } else {
      setShowCommands(false)
      setSlashQuery('')
    }
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent
      if (customEvent.detail) {
        setInput(customEvent.detail)
        textareaRef.current?.focus()
      }
    }
    window.addEventListener('navicode-send', handler)
    return () => window.removeEventListener('navicode-send', handler)
  }, [])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split('.').pop() || ''
    const text = await file.text()

    const formatted = `\`\`\`${ext}\n// filepath: ${file.name}\n${text}\n\`\`\``
    setUploadedFile({ name: file.name, content: formatted })
    setInput(prev => (prev ? prev + '\n\n' + formatted : formatted))
    textareaRef.current?.focus()
    e.target.value = ''
  }, [])

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [input, adjustHeight])

  const handleSubmit = useCallback(() => {
    if (!input.trim() || disabled) return
    onSend(input.trim())
    setInput('')
    setShowCommands(false)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input, disabled, onSend])

  const selectCommand = useCallback((cmd: SlashCommand) => {
    if (cmd.id.startsWith('model::')) {
      const modelName = cmd.id.replace('model::', '')
      setSelectedModel(modelName)
      setInput('')
      setShowCommands(false)
      useEditorStore.getState().addTerminalLine(`[NaviCode System] Switched model to ${modelName}`)
      return
    }
    if (cmd.type === 'action') {
      // Action commands execute immediately client-side
      onCommand?.(cmd.id)
      setInput('')
    } else {
      // Template commands fill the input
      setInput(cmd.template)
      textareaRef.current?.setSelectionRange(cmd.template.length, cmd.template.length)
    }
    setShowCommands(false)
    textareaRef.current?.focus()
  }, [onCommand, setSelectedModel])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showCommands && flattenedFiltered.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIndex(i => Math.min(i + 1, flattenedFiltered.length - 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIndex(i => Math.max(i - 1, 0))
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          selectCommand(flattenedFiltered[selectedIndex])
          return
        }
        if (e.key === 'Escape') {
          setShowCommands(false)
          return
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [showCommands, flattenedFiltered, selectedIndex, selectCommand, handleSubmit]
  )

  const catLabels: Record<string, string> = {
    Models: 'Available AI Models',
    Chat: 'Chat', Code: 'Code & Analysis', Git: 'Git & Version Control',
    Files: 'Files', Skills: 'Skills', System: 'System',
  }

  const catColors: Record<string, string> = {
    Models: 'text-primary font-bold',
    Chat: 'text-blue-500', Code: 'text-emerald-500', Git: 'text-orange-500',
    Files: 'text-violet-500', Skills: 'text-cyan-500', System: 'text-yellow-500',
  }

  return (
    <div className="border-t bg-muted/20 p-3 relative">
      {showCommands && flattenedFiltered.length > 0 && (
        <div
          ref={containerRef}
          className="absolute bottom-full left-1 right-1 sm:left-3 sm:right-3 mb-1 mx-auto max-w-3xl bg-popover border rounded-lg sm:rounded-xl shadow-xl overflow-hidden z-50"
        >
          <div className="max-h-52 sm:max-h-64 overflow-y-auto">
            {categoryOrder.filter(cat => groupedCommands[cat]?.length).map(category => (
              <div key={category}>
                <div className={cn(
                  'px-2 sm:px-3 py-1 sm:py-1.5 text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold border-b flex items-center gap-1.5',
                  catColors[category] || 'text-muted-foreground'
                )}>
                  {catLabels[category] || category}
                  <span className="text-muted-foreground/40 font-normal">({groupedCommands[category].length})</span>
                </div>
                {groupedCommands[category].map((cmd) => {
                  const globalIndex = flattenedFiltered.indexOf(cmd)
                  const Icon = cmd.icon
                  return (
                    <button
                      key={cmd.id}
                      className={cn(
                        'flex items-center gap-2 sm:gap-3 w-full px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[11px] sm:text-sm transition-colors',
                        globalIndex === selectedIndex ? 'bg-accent' : 'hover:bg-accent/50'
                      )}
                      onClick={() => selectCommand(cmd)}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                    >
                      <Icon className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0 truncate">
                        <span className="font-medium">/{cmd.label}</span>
                        <span className="hidden sm:inline text-xs text-muted-foreground ml-2 truncate">{cmd.description}</span>
                      </div>
                      {cmd.type === 'action' && (
                        <span className="sm:inline text-[9px] sm:text-[10px] text-muted-foreground/40 bg-muted px-1 sm:px-1.5 py-0.5 rounded font-medium flex-shrink-0">↩</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="hidden sm:flex px-3 py-1.5 border-t text-[10px] text-muted-foreground/50 items-center justify-between">
            <span>Type to filter  ·  ↑↓ navigate  ·  ↵ select  ·  esc close</span>
            <span>↩ = instant</span>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask NaviCode anything... (/ for commands, Enter to send, Shift+Enter for new line)"
            disabled={disabled}
            className="min-h-[44px] max-h-[200px] resize-none pr-4 text-sm bg-background border-muted-foreground/20 focus-visible:ring-1 focus-visible:ring-primary/50 rounded-xl"
            rows={1}
          />
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            variant="ghost"
            size="icon"
            className="h-11 w-11 rounded-xl text-muted-foreground hover:text-foreground"
            title="Upload file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={disabled || !input.trim()}
            size="icon"
            className="h-11 w-11 rounded-xl"
          >
            {disabled ? (
              <Square className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      {uploadedFile && (
        <div className="mt-2 max-w-3xl mx-auto flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-lg">
          <FileText className="h-3.5 w-3.5" />
          <span className="font-medium">{uploadedFile.name}</span>
          <span className="text-muted-foreground/60">attached</span>
          <button
            className="ml-auto text-muted-foreground/50 hover:text-foreground"
            onClick={() => { setUploadedFile(null); setInput(input.replace(uploadedFile.content, '').trim()) }}
          >
            ×
          </button>
        </div>
      )}
      <div className="mt-1.5 text-center">
        <span className="text-[10px] text-muted-foreground">
          NaviCode can make mistakes. Review code before using.
        </span>
      </div>
    </div>
  )
}
