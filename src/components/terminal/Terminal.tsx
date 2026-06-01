'use client'

import { useEditorStore, type TerminalLine } from '@/stores/editor-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Terminal as TerminalIcon, Trash2, Minimize2, Maximize2 } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'

export function TerminalPanel() {
  const { terminalOutput, addTerminalLine, clearTerminal, showTerminal, toggleTerminal } =
    useEditorStore()
  const [command, setCommand] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [terminalOutput])

  useEffect(() => {
    if (showTerminal) {
      inputRef.current?.focus()
    }
  }, [showTerminal])

  const handleCommand = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && command.trim()) {
        addTerminalLine({ type: 'input', content: command })

        // Simulate command output
        setTimeout(() => {
          const cmd = command.trim().toLowerCase()
          if (cmd === 'help') {
            addTerminalLine({
              type: 'info',
              content: `Available commands:
  help     - Show this help message
  ls       - List files in current directory
  pwd      - Print working directory
  echo     - Echo text
  clear    - Clear terminal
  node -v  - Show Node.js version
  npm -v   - Show npm version
  date     - Show current date
  whoami   - Show current user
  git status - Show git status`,
            })
          } else if (cmd === 'ls') {
            addTerminalLine({
              type: 'output',
              content: 'src/  node_modules/  package.json  tsconfig.json  README.md  .gitignore',
            })
          } else if (cmd === 'pwd') {
            addTerminalLine({ type: 'output', content: '/home/user/project' })
          } else if (cmd.startsWith('echo ')) {
            addTerminalLine({ type: 'output', content: command.slice(5) })
          } else if (cmd === 'clear') {
            clearTerminal()
          } else if (cmd === 'node -v') {
            addTerminalLine({ type: 'output', content: 'v20.11.0' })
          } else if (cmd === 'npm -v') {
            addTerminalLine({ type: 'output', content: '10.2.4' })
          } else if (cmd === 'date') {
            addTerminalLine({ type: 'output', content: new Date().toString() })
          } else if (cmd === 'whoami') {
            addTerminalLine({ type: 'output', content: 'developer' })
          } else if (cmd === 'git status') {
            addTerminalLine({
              type: 'output',
              content: `On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  modified:   src/app/page.tsx

Untracked files:
  src/components/NewFeature.tsx

no changes added to commit`,
            })
          } else if (cmd.startsWith('npm ') || cmd.startsWith('bun ')) {
            addTerminalLine({ type: 'info', content: `Running ${command}...` })
            setTimeout(() => {
              addTerminalLine({ type: 'output', content: `✓ ${command} completed successfully` })
            }, 1000)
          } else {
            addTerminalLine({
              type: 'error',
              content: `zsh: command not found: ${command.split(' ')[0]}`,
            })
          }
        }, 200)

        setCommand('')
      }
    },
    [command, addTerminalLine, clearTerminal]
  )

  if (!showTerminal) return null

  return (
    <div className="flex flex-col h-full bg-[#1a1b26] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10 bg-[#16161e]">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-medium text-white/70">Terminal</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-white/40 hover:text-white/80"
            onClick={clearTerminal}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-white/40 hover:text-white/80"
            onClick={toggleTerminal}
          >
            <Minimize2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Output */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-3 font-mono text-xs space-y-0.5">
          <div className="text-emerald-400/70">
            Welcome to ZCode Terminal v1.0.0
            <br />
            Type &quot;help&quot; for available commands.
          </div>
          {terminalOutput.map((line) => (
            <TerminalLineItem key={line.id} line={line} />
          ))}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-white/10 bg-[#16161e]">
        <span className="text-emerald-400 text-xs font-mono">❯</span>
        <Input
          ref={inputRef}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleCommand}
          placeholder="Type a command..."
          className="h-6 text-xs font-mono bg-transparent border-0 focus-visible:ring-0 text-white placeholder:text-white/30 px-0"
        />
      </div>
    </div>
  )
}

function TerminalLineItem({ line }: { line: TerminalLine }) {
  const colorMap = {
    input: 'text-white',
    output: 'text-white/70',
    error: 'text-red-400',
    info: 'text-emerald-400/80',
  }

  if (line.type === 'input') {
    return (
      <div className="text-white">
        <span className="text-emerald-400">❯ </span>
        {line.content}
      </div>
    )
  }

  return (
    <div className={`whitespace-pre-wrap ${colorMap[line.type]}`}>
      {line.content}
    </div>
  )
}
