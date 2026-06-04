'use client'

import { useEditorStore } from '@/stores/editor-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { X, FileCode, Save, Copy, Check } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useState, useCallback } from 'react'
import { Textarea } from '@/components/ui/textarea'

export function CodeEditor() {
  const { openFiles, activeFileId, setActiveFile, closeFile, updateFileContent, showEditor } =
    useEditorStore()
  const [editingFileId, setEditingFileId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null)

  const activeFile = openFiles.find((f) => f.id === activeFileId)

  const handleEdit = useCallback(
    (fileId: string, content: string) => {
      setEditingFileId(fileId)
      setEditContent(content)
    },
    []
  )

  const handleSave = useCallback(
    (fileId: string) => {
      updateFileContent(fileId, editContent)
      setEditingFileId(null)
    },
    [editContent, updateFileContent]
  )

  const handleCopy = useCallback((fileId: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedFileId(fileId)
    setTimeout(() => setCopiedFileId(null), 2000)
  }, [])

  if (!showEditor || openFiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/20">
        <div className="text-center text-muted-foreground">
          <FileCode className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No file open</p>
          <p className="text-xs mt-1">Click a file in the explorer or ask AI to generate code</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab Bar */}
      <div className="flex items-center border-b bg-muted/30 overflow-x-auto">
        {openFiles.map((file) => (
          <div
            key={file.id}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border-r cursor-pointer group whitespace-nowrap ${
              file.id === activeFileId
                ? 'bg-background text-foreground border-b-2 border-b-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }`}
            onClick={() => setActiveFile(file.id)}
          >
            <FileCode className="h-3 w-3" />
            <span>{file.name}</span>
            {file.isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            )}
            <button
              className="ml-1 opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5 transition-opacity"
              onClick={(e) => {
                e.stopPropagation()
                closeFile(file.id)
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Editor Content */}
      {activeFile && (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/10">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground font-mono">{activeFile.path}</span>
              <span className="text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
                {activeFile.language}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {editingFileId === activeFile.id ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => handleSave(activeFile.id)}
                  >
                    <Save className="h-3 w-3 mr-1" />
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => setEditingFileId(null)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => handleEdit(activeFile.id, activeFile.content)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => handleCopy(activeFile.id, activeFile.content)}
                  >
                    {copiedFileId === activeFile.id ? (
                      <Check className="h-3 w-3 mr-1 text-emerald-500" />
                    ) : (
                      <Copy className="h-3 w-3 mr-1" />
                    )}
                    {copiedFileId === activeFile.id ? 'Copied' : 'Copy'}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Code */}
          <ScrollArea className="flex-1 min-h-0">
            {editingFileId === activeFile.id ? (
              <div className="p-4">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[400px] font-mono text-sm bg-[#282c34] text-white border-0 resize-y"
                  onKeyDown={(e) => {
                    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      handleSave(activeFile.id)
                    }
                  }}
                />
              </div>
            ) : (
              <SyntaxHighlighter
                language={activeFile.language || 'text'}
                style={oneDark}
                showLineNumbers
                wrapLongLines={true}
                customStyle={{
                  margin: 0,
                  padding: '16px',
                  fontSize: '12.5px',
                  lineHeight: '1.6',
                  background: '#1e1e2e',
                  minHeight: '100%',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
                lineNumberStyle={{
                  minWidth: '3em',
                  paddingRight: '1em',
                  color: 'rgba(255,255,255,0.2)',
                }}
                codeTagProps={{
                  style: { fontFamily: 'var(--font-geist-mono), monospace' },
                }}
              >
                {activeFile.content}
              </SyntaxHighlighter>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
