'use client'

import { useEditorStore, type TerminalLine } from '@/stores/editor-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Terminal as TerminalIcon, Trash2, Minimize2 } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'

export function TerminalPanel() {
  const { 
    terminalOutput, 
    addTerminalLine, 
    clearTerminal, 
    showTerminal, 
    toggleTerminal,
    setCwd: setStoreCwd 
  } = useEditorStore()
  const [command, setCommand] = useState('')
  const [cwd, setCwd] = useState<string>('')
  const [isRunning, setIsRunning] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load initial cwd from API
  useEffect(() => {
    fetch('/api/terminal?action=cwd')
      .then((r) => r.json())
      .then((data) => {
        if (data.cwd) {
          setCwd(data.cwd)
          setStoreCwd(data.cwd)
        }
      })
      .catch(() => {})
  }, [setStoreCwd])

  // Listen for open-folder event in terminal
  useEffect(() => {
    const handler = (e: Event) => {
      const { detail: path } = e as CustomEvent
      if (path) {
        setCwd(path)
      }
    }
    window.addEventListener('navicode-open-folder', handler)
    return () => window.removeEventListener('navicode-open-folder', handler)
  }, [])

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

  // Listen to run-command events from the menu bar
  useEffect(() => {
    const handleRunCommand = (e: Event) => {
      const cmd = (e as CustomEvent<string>).detail
      if (!cmd) return
      // Simulate pressing Enter with the command
      setCommand(cmd)
      // Execute immediately via API
      const run = async () => {
        addTerminalLine({ type: 'input', content: cmd })
        setIsRunning(true)
        try {
          const res = await fetch('/api/terminal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmd, cwd: cwd || undefined }),
          })
          const data = await res.json()
          if (data.output?.trim()) addTerminalLine({ type: 'output', content: data.output })
          if (data.error?.trim()) addTerminalLine({ type: 'error', content: data.error })
        } catch (err) {
          addTerminalLine({ type: 'error', content: `Error: ${err instanceof Error ? err.message : 'Unknown'}` })
        } finally {
          setIsRunning(false)
          setCommand('')
        }
      }
      run()
    }

    window.addEventListener('navicode-run-command', handleRunCommand)
    return () => window.removeEventListener('navicode-run-command', handleRunCommand)
  }, [cwd, addTerminalLine])

  const handleCommand = useCallback(
    async (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const newIdx = Math.min(historyIndex + 1, history.length - 1)
        setHistoryIndex(newIdx)
        if (history[newIdx]) setCommand(history[newIdx])
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const newIdx = Math.max(historyIndex - 1, -1)
        setHistoryIndex(newIdx)
        setCommand(newIdx === -1 ? '' : history[newIdx])
        return
      }

      if (e.key !== 'Enter' || !command.trim() || isRunning) return

      const cmd = command.trim()
      addTerminalLine({ type: 'input', content: cmd })
      setHistory((prev) => [cmd, ...prev.slice(0, 49)])
      setHistoryIndex(-1)
      setCommand('')

      // Handle built-in commands
      if (cmd === 'clear') {
        clearTerminal()
        return
      }

      // Handle cd separately since it needs to update cwd
      if (cmd.startsWith('cd ') || cmd === 'cd') {
        const target = cmd.slice(3).trim() || '~'
        try {
          const res = await fetch('/api/terminal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: `cd "${target.replace('~', process.env.HOME || '/Users/ding')}" && pwd`, cwd }),
          })
          const data = await res.json()
          if (data.success && data.output) {
            const newCwd = data.output.trim()
            setCwd(newCwd)
            setStoreCwd(newCwd)
            addTerminalLine({ type: 'output', content: '' })
          } else {
            addTerminalLine({ type: 'error', content: data.error || `cd: ${target}: No such file or directory` })
          }
        } catch {
          addTerminalLine({ type: 'error', content: 'Failed to execute command' })
        }
        return
      }

      // Execute via real terminal API
      setIsRunning(true)
      try {
        const res = await fetch('/api/terminal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: cmd,
            cwd: cwd || undefined,
            timeout: 60000,
          }),
        })

        const data = await res.json()

        if (data.output && data.output.trim()) {
          addTerminalLine({ type: 'output', content: data.output })
        }
        if (data.error && data.error.trim()) {
          addTerminalLine({ type: 'error', content: data.error })
        }
        if (!data.success && !data.error && !data.output) {
          addTerminalLine({ type: 'error', content: `Command exited with code ${data.exitCode || 1}` })
        }
      } catch (err) {
        addTerminalLine({ type: 'error', content: `Network error: ${err instanceof Error ? err.message : 'Unknown error'}` })
      } finally {
        setIsRunning(false)
      }
    },
    [command, cwd, isRunning, history, historyIndex, addTerminalLine, clearTerminal]
  )

  if (!showTerminal) return null

  const cwdDisplay = cwd ? cwd.replace(/\/Users\/[^/]+/, '~').replace(process.env.HOME || '', '~') : '~'

  return (
    <div className="flex flex-col h-full bg-[#1a1b26] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10 bg-[#16161e]">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-medium text-white/70">Terminal</span>
          {cwd && (
            <span className="text-xs text-white/40 font-mono">{cwdDisplay}</span>
          )}
          {isRunning && (
            <span className="text-xs text-amber-400 animate-pulse">running...</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-white/40 hover:text-white/80"
            onClick={clearTerminal}
            title="Clear terminal"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-white/40 hover:text-white/80"
            onClick={toggleTerminal}
            title="Minimize"
          >
            <Minimize2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Output */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-3 font-mono text-xs space-y-0.5">
          <div className="text-emerald-400/70">
            NaviCode Terminal — connected to local system
            <br />
            Working directory: {cwd || 'loading...'}
            <br />
            Type any shell command. Use ↑↓ for history.
          </div>
          {terminalOutput.map((line) => (
            <TerminalLineItem key={line.id} line={line} />
          ))}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-white/10 bg-[#16161e]">
        <span className="text-emerald-400 text-xs font-mono flex-shrink-0">
          {cwdDisplay} ❯
        </span>
        <Input
          ref={inputRef}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleCommand}
          placeholder={isRunning ? 'Running...' : 'Type a command...'}
          disabled={isRunning}
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
    <div className={`whitespace-pre-wrap break-all ${colorMap[line.type]}`}>
      {line.content}
    </div>
  )
}
