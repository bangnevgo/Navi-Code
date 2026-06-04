'use client'

import { useState, useCallback, useEffect } from 'react'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { FileExplorer } from '@/components/file-explorer/FileExplorer'
import { CodeEditor } from '@/components/editor/CodeEditor'
import { TerminalPanel } from '@/components/terminal/Terminal'
import { SkillsPanel } from '@/components/skills/SkillsPanel'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MessageSquare,
  Files,
  Settings,
  Terminal,
  Code2,
  Sun,
  Moon,
  Sparkles,
  GitBranch,
  Zap,
  Key,
  FolderOpen,
  FilePlus,
  Save,
  X,
  RotateCcw,
  Copy,
  Scissors,
  Clipboard,
  Search,
  Play,
  Square,
  ExternalLink,
  Info,
  Github,
  Keyboard,
  ChevronRight,
} from 'lucide-react'
import { useChatStore } from '@/stores/chat-store'
import { useEditorStore } from '@/stores/editor-store'
import { useProviderStore } from '@/stores/provider-store'
import { useFileStore } from '@/stores/file-store'

export function IDELayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeSidebarTab, setActiveSidebarTab] = useState<'files' | 'chat-history' | 'skills'>('files')
  const [isDark, setIsDark] = useState(true)
  const [mounted, setMounted] = useState(false)
  const { selectedModel, setSelectedModel } = useChatStore()
  const { showTerminal, toggleTerminal, showEditor, setCwd } = useEditorStore()
  const { providers, activeProviderId, setActiveProvider, getActiveProvider, getAllModels } = useProviderStore()

  // Wait for client-side hydration before rendering persisted state
  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true)
    }, 0)

    // Fetch and initialize the workspace directory in the store
    fetch('/api/terminal?action=cwd')
      .then((r) => r.json())
      .then((data) => {
        if (data.cwd) {
          setCwd(data.cwd)
        }
      })
      .catch(() => {})

    return () => clearTimeout(timer)
  }, [setCwd])

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => !prev)
    document.documentElement.classList.toggle('dark')
  }, [])

  // Only compute provider-dependent values after mount to avoid hydration mismatch
  const activeProvider = mounted ? getActiveProvider() : undefined
  const allModels = mounted ? getAllModels() : []

  // Group models by provider for the dropdown
  const modelsByProvider = mounted
    ? providers.reduce<Record<string, { provider: typeof providers[0]; models: string[] }>>(
        (acc, p) => {
          if (p.apiKey || p.type === 'builtin') {
            acc[p.id] = { provider: p, models: p.models }
          }
          return acc
        },
        {}
      )
    : {}

  return (
    <TooltipProvider delayDuration={300}>
      <div className={`h-screen flex flex-col bg-background text-foreground ${isDark ? 'dark' : ''}`}>
        {/* Top Bar */}
        <header className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            {/* Logo */}
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <span className="font-bold text-sm tracking-tight">NaviCode</span>
            </div>

            <Separator orientation="vertical" className="h-4 mx-1" />

            {/* Menu Bar */}
            <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
              {/* FILE */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-2 py-1 rounded hover:bg-accent hover:text-foreground transition-colors">File</button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">File</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={async () => {
                    let folderPath = ''
                    try {
                      const res = await fetch('/api/fs?action=browse-folder')
                      const data = await res.json()
                      if (data.success && data.path) {
                        folderPath = data.path
                      }
                    } catch {
                      // Ignore and fallback
                    }

                    if (folderPath) {
                      useFileStore.getState().setRootPath(folderPath)
                      useEditorStore.getState().setCwd(folderPath)
                      window.dispatchEvent(new CustomEvent('navicode-open-folder', { detail: folderPath }))
                    } else {
                      const path = window.prompt('Enter folder path manually:', useFileStore.getState().rootPath || '/Users/ding')
                      if (path) {
                        useFileStore.getState().setRootPath(path)
                        useEditorStore.getState().setCwd(path)
                        window.dispatchEvent(new CustomEvent('navicode-open-folder', { detail: path }))
                      }
                    }
                  }}>
                    <FolderOpen className="mr-2 h-3.5 w-3.5" />
                    Open Folder...
                    <DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    const name = window.prompt('New file name:', 'untitled.ts')
                    if (name) {
                      useEditorStore.getState().openFile({ name, path: `/new/${name}`, content: '', language: 'typescript' })
                    }
                  }}>
                    <FilePlus className="mr-2 h-3.5 w-3.5" />
                    New File
                    <DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {
                    const state = useEditorStore.getState()
                    const activeFile = state.openFiles.find(f => f.id === state.activeFileId)
                    if (!activeFile) return
                    fetch('/api/fs', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'write', path: activeFile.path, content: activeFile.content }),
                    }).then(() => {
                      state.updateFileContent(activeFile.id, activeFile.content)
                      window.dispatchEvent(new CustomEvent('navicode-saved', { detail: activeFile.path }))
                    })
                  }}>
                    <Save className="mr-2 h-3.5 w-3.5" />
                    Save
                    <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {
                    const state = useEditorStore.getState()
                    const activeFile = state.openFiles.find(f => f.id === state.activeFileId)
                    if (activeFile) state.closeFile(activeFile.id)
                  }}>
                    <X className="mr-2 h-3.5 w-3.5" />
                    Close File
                    <DropdownMenuShortcut>⌘W</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* EDIT */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-2 py-1 rounded hover:bg-accent hover:text-foreground transition-colors">Edit</button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Edit</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => document.execCommand('copy')}>
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    Copy
                    <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => document.execCommand('cut')}>
                    <Scissors className="mr-2 h-3.5 w-3.5" />
                    Cut
                    <DropdownMenuShortcut>⌘X</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => document.execCommand('paste')}>
                    <Clipboard className="mr-2 h-3.5 w-3.5" />
                    Paste
                    <DropdownMenuShortcut>⌘V</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => document.execCommand('selectAll')}>
                    Select All
                    <DropdownMenuShortcut>⌘A</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => document.execCommand('undo')}>
                    <RotateCcw className="mr-2 h-3.5 w-3.5" />
                    Undo
                    <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* VIEW */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-2 py-1 rounded hover:bg-accent hover:text-foreground transition-colors">View</button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">View</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={sidebarOpen && activeSidebarTab === 'files'}
                    onCheckedChange={() => {
                      setActiveSidebarTab('files')
                      setSidebarOpen(true)
                    }}
                  >
                    <Files className="mr-2 h-3.5 w-3.5" />
                    Explorer
                    <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={showTerminal}
                    onCheckedChange={toggleTerminal}
                  >
                    <Terminal className="mr-2 h-3.5 w-3.5" />
                    Terminal
                    <DropdownMenuShortcut>⌘`</DropdownMenuShortcut>
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={showEditor}
                    onCheckedChange={(v) => useEditorStore.getState().setShowEditor(v)}
                  >
                    <Code2 className="mr-2 h-3.5 w-3.5" />
                    Editor Panel
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={sidebarOpen && activeSidebarTab === 'chat-history'}
                    onCheckedChange={() => {
                      setActiveSidebarTab('chat-history')
                      setSidebarOpen(true)
                    }}
                  >
                    <MessageSquare className="mr-2 h-3.5 w-3.5" />
                    Chat History
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={sidebarOpen && activeSidebarTab === 'skills'}
                    onCheckedChange={() => {
                      setActiveSidebarTab('skills')
                      setSidebarOpen(true)
                    }}
                  >
                    <Zap className="mr-2 h-3.5 w-3.5" />
                    Agent Skills
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={toggleTheme}>
                    {isDark ? <Sun className="mr-2 h-3.5 w-3.5" /> : <Moon className="mr-2 h-3.5 w-3.5" />}
                    Toggle Theme
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* RUN */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-2 py-1 rounded hover:bg-accent hover:text-foreground transition-colors">Run</button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Run</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {
                    if (!showTerminal) toggleTerminal()
                    const state = useEditorStore.getState()
                    const activeFile = state.openFiles.find(f => f.id === state.activeFileId)
                    if (activeFile) {
                      const ext = activeFile.name.split('.').pop()
                      const cmds: Record<string, string> = {
                        ts: `npx ts-node "${activeFile.path}"`,
                        js: `node "${activeFile.path}"`,
                        py: `python3 "${activeFile.path}"`,
                        sh: `bash "${activeFile.path}"`,
                      }
                      const cmd = cmds[ext || ''] || `echo "Cannot run .${ext} files directly"`
                      window.dispatchEvent(new CustomEvent('navicode-run-command', { detail: cmd }))
                    } else {
                      window.dispatchEvent(new CustomEvent('navicode-run-command', { detail: 'echo "No file open. Open a file first."' }))
                    }
                  }}>
                    <Play className="mr-2 h-3.5 w-3.5" />
                    Run Current File
                    <DropdownMenuShortcut>⌘⏎</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    if (!showTerminal) toggleTerminal()
                    window.dispatchEvent(new CustomEvent('navicode-run-command', { detail: 'npm run dev' }))
                  }}>
                    <Play className="mr-2 h-3.5 w-3.5 text-emerald-500" />
                    npm run dev
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    if (!showTerminal) toggleTerminal()
                    window.dispatchEvent(new CustomEvent('navicode-run-command', { detail: 'npm run build' }))
                  }}>
                    <Play className="mr-2 h-3.5 w-3.5 text-blue-500" />
                    npm run build
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {
                    if (!showTerminal) toggleTerminal()
                    window.dispatchEvent(new CustomEvent('navicode-run-command', { detail: 'npm test' }))
                  }}>
                    <Play className="mr-2 h-3.5 w-3.5 text-amber-500" />
                    Run Tests
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {
                    if (!showTerminal) toggleTerminal()
                  }}>
                    <Terminal className="mr-2 h-3.5 w-3.5" />
                    Open Terminal
                    <DropdownMenuShortcut>⌘`</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* HELP */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-2 py-1 rounded hover:bg-accent hover:text-foreground transition-colors">Help</button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Help</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => window.open('https://github.com', '_blank')}>
                    <Github className="mr-2 h-3.5 w-3.5" />
                    GitHub Repository
                    <ExternalLink className="ml-auto h-3 w-3 opacity-50" />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {
                    window.dispatchEvent(new CustomEvent('navicode-send', {
                      detail: 'What can you help me with? Show me a quick overview of NaviCode features.'
                    }))
                  }}>
                    <Sparkles className="mr-2 h-3.5 w-3.5" />
                    Ask AI for Help
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    window.dispatchEvent(new CustomEvent('navicode-send', {
                      detail: 'Show me all available keyboard shortcuts for NaviCode.'
                    }))
                  }}>
                    <Keyboard className="mr-2 h-3.5 w-3.5" />
                    Keyboard Shortcuts
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Info className="mr-2 h-3.5 w-3.5" />
                    NaviCode v0.2.0
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Model Selector - grouped by provider */}
            <Select
              value={`${activeProviderId}::${selectedModel}`}
              onValueChange={(val) => {
                const [providerId, model] = val.split('::')
                setActiveProvider(providerId)
                setSelectedModel(model)
              }}
            >
              <SelectTrigger className="h-7 text-xs w-[200px] bg-muted/50 border-transparent">
                <div className="flex items-center gap-1">
                  {activeProvider?.icon && (
                    <span className="text-xs">{activeProvider.icon}</span>
                  )}
                  <Sparkles className="h-3 w-3 text-primary" />
                </div>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {Object.entries(modelsByProvider).map(([providerId, { provider, models }]) => (
                  <SelectGroup key={providerId}>
                    <SelectLabel className="text-[10px] text-muted-foreground">
                      {provider.icon} {provider.name}
                    </SelectLabel>
                    {models.map((model) => (
                      <SelectItem key={`${providerId}::${model}`} value={`${providerId}::${model}`} className="text-xs">
                        {model}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>

            {/* Provider status indicator */}
            {activeProvider && activeProvider.type !== 'builtin' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    {activeProvider.apiKey ? (
                      <Key className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Key className="h-3 w-3 text-red-400" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {activeProvider.apiKey ? 'API key configured' : 'No API key set - click Settings'}
                </TooltipContent>
              </Tooltip>
            )}

            <Separator orientation="vertical" className="h-4" />

            {/* Settings */}
            <SettingsDialog />

            {/* Theme Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleTheme}>
                  {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle theme</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Activity Bar */}
          <div className="w-10 flex flex-col items-center py-2 gap-1 border-r bg-muted/20">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${activeSidebarTab === 'files' && sidebarOpen ? 'bg-accent text-accent-foreground border-l-2 border-primary' : ''}`}
                  onClick={() => {
                    if (activeSidebarTab === 'files' && sidebarOpen) {
                      setSidebarOpen(false)
                    } else {
                      setActiveSidebarTab('files')
                      setSidebarOpen(true)
                    }
                  }}
                >
                  <Files className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Explorer</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${activeSidebarTab === 'chat-history' && sidebarOpen ? 'bg-accent text-accent-foreground border-l-2 border-primary' : ''}`}
                  onClick={() => {
                    if (activeSidebarTab === 'chat-history' && sidebarOpen) {
                      setSidebarOpen(false)
                    } else {
                      setActiveSidebarTab('chat-history')
                      setSidebarOpen(true)
                    }
                  }}
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Chat History</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${activeSidebarTab === 'skills' && sidebarOpen ? 'bg-accent text-accent-foreground border-l-2 border-primary' : ''}`}
                  onClick={() => {
                    if (activeSidebarTab === 'skills' && sidebarOpen) {
                      setSidebarOpen(false)
                    } else {
                      setActiveSidebarTab('skills')
                      setSidebarOpen(true)
                    }
                  }}
                >
                  <Zap className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Agent Skills</TooltipContent>
            </Tooltip>

            <div className="flex-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Theme</TooltipContent>
            </Tooltip>
          </div>

          {/* Resizable Panels */}
          <ResizablePanelGroup direction="horizontal" className="flex-1">
            {/* Sidebar */}
            {sidebarOpen && (
              <>
                <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
                  {activeSidebarTab === 'files' ? (
                    <FileExplorer />
                  ) : activeSidebarTab === 'skills' ? (
                    <SkillsPanel />
                  ) : (
                    <ChatHistory />
                  )}
                </ResizablePanel>
                <ResizableHandle withHandle />
              </>
            )}

            {/* Chat Panel */}
            <ResizablePanel defaultSize={showEditor ? 45 : 100} minSize={30}>
              <ChatPanel />
            </ResizablePanel>

            {/* Editor + Terminal */}
            {showEditor && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={35} minSize={25}>
                  <ResizablePanelGroup direction="vertical">
                    <ResizablePanel defaultSize={showTerminal ? 65 : 100} minSize={30}>
                      <CodeEditor />
                    </ResizablePanel>
                    {showTerminal && (
                      <>
                        <ResizableHandle withHandle />
                        <ResizablePanel defaultSize={35} minSize={15} maxSize={60}>
                          <TerminalPanel />
                        </ResizablePanel>
                      </>
                    )}
                  </ResizablePanelGroup>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>

        {/* Status Bar */}
        <footer className="flex items-center justify-between px-3 py-0.5 border-t bg-primary text-primary-foreground text-[11px]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <GitBranch className="h-3 w-3" />
              <span>main</span>
            </div>
            <span>0 errors, 0 warnings</span>
          </div>
          <div className="flex items-center gap-3" suppressHydrationWarning>
            <span className="flex items-center gap-1" suppressHydrationWarning>
              {mounted && activeProvider?.icon} {mounted ? (activeProvider?.name || 'NaviCode') : 'NaviCode'}
            </span>
            <Separator orientation="vertical" className="h-2.5 bg-primary-foreground/30" />
            <span suppressHydrationWarning>{mounted ? selectedModel : ''}</span>
            <Separator orientation="vertical" className="h-2.5 bg-primary-foreground/30" />
            <span>UTF-8</span>
            <span>TypeScript</span>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  )
}

function ChatHistory() {
  const { conversations, activeConversationId, setActiveConversation, createConversation, deleteConversation } = useChatStore()

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Chat History
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-xs"
          onClick={() => createConversation()}
        >
          New Chat
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {conversations.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            No conversations yet
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`flex items-center justify-between px-3 py-2 cursor-pointer text-xs hover:bg-accent/50 transition-colors ${
                conv.id === activeConversationId ? 'bg-accent' : ''
              }`}
              onClick={() => setActiveConversation(conv.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{conv.title}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {conv.messages.length} messages · {new Date(conv.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <button
                className="ml-2 opacity-0 hover:opacity-100 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteConversation(conv.id)
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
