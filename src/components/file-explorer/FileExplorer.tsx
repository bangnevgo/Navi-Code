'use client'

import { useFileStore, type FileNode } from '@/stores/file-store'
import { useEditorStore } from '@/stores/editor-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Search, RefreshCw, FolderInput, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'

export function FileExplorer() {
  const { fileTree, expandedFolders, selectedFilePath, toggleFolder, selectFile, setFileTree, rootPath, setRootPath } = useFileStore()
  const { openFile } = useEditorStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDirectory = useCallback(async (path?: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const targetPath = path || rootPath || '.'
      const res = await fetch(`/api/fs?action=list&path=${encodeURIComponent(targetPath === '.' ? '' : targetPath)}`)
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to list directory')

      // Convert API response to FileNode tree
      const nodes: FileNode[] = await Promise.all(
        data.items.map(async (item: { name: string; type: string; path: string }) => {
          const node: FileNode = {
            id: item.path,
            name: item.name,
            type: item.type === 'directory' ? 'folder' : 'file',
            path: item.path,
            language: getLanguageFromName(item.name),
          }
          return node
        })
      )

      // Only auto-set rootPath on initial load when no explicit path was provided
      if (data.root && !path && !rootPath) {
        setRootPath(data.root)
      }

      setFileTree(nodes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory')
    } finally {
      setIsLoading(false)
    }
  }, [rootPath, setFileTree, setRootPath])

  // Load directory on mount
  useEffect(() => {
    loadDirectory()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Use ref to avoid stale closure in event listener
  const loadDirRef = useRef(loadDirectory)
  loadDirRef.current = loadDirectory

  // Listen for open-folder event (stable listener, no re-registration needed)
  useEffect(() => {
    const handler = (e: Event) => {
      const { detail: path } = e as CustomEvent
      if (path) loadDirRef.current(path)
    }
    window.addEventListener('navicode-open-folder', handler)
    return () => window.removeEventListener('navicode-open-folder', handler)
  }, [])

  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return fileTree
    const filterNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes.reduce<FileNode[]>((acc, node) => {
        if (node.type === 'file') {
          if (node.name.toLowerCase().includes(searchQuery.toLowerCase())) {
            acc.push(node)
          }
        } else if (node.children) {
          const filteredChildren = filterNodes(node.children)
          if (filteredChildren.length > 0) {
            acc.push({ ...node, children: filteredChildren })
          } else if (node.name.toLowerCase().includes(searchQuery.toLowerCase())) {
            acc.push(node)
          }
        } else if (node.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          acc.push(node)
        }
        return acc
      }, [])
    }
    return filterNodes(fileTree)
  }, [fileTree, searchQuery])

  const handleFileClick = useCallback(
    async (node: FileNode) => {
      selectFile(node.path)
      if (node.type === 'file') {
        // Load file content from real API
        try {
          const res = await fetch(`/api/fs?action=read&path=${encodeURIComponent(node.path)}`)
          const data = await res.json()
          if (data.success) {
            openFile({
              name: node.name,
              path: node.path,
              content: data.content,
              language: node.language || 'text',
            })
          }
        } catch {
          // If API fails, try to open with whatever content we have
          if (node.content !== undefined) {
            openFile({
              name: node.name,
              path: node.path,
              content: node.content,
              language: node.language || 'text',
            })
          }
        }
      }
    },
    [selectFile, openFile]
  )

  const handleToggleFolder = useCallback(
    async (node: FileNode) => {
      toggleFolder(node.path)
      // If folder has no children yet, load them
      if (!node.children || node.children.length === 0) {
        try {
          const res = await fetch(`/api/fs?action=list&path=${encodeURIComponent(node.path)}`)
          const data = await res.json()
          if (data.success) {
            const children: FileNode[] = data.items.map((item: { name: string; type: string; path: string }) => ({
              id: item.path,
              name: item.name,
              type: item.type === 'directory' ? 'folder' : 'file',
              path: item.path,
              language: getLanguageFromName(item.name),
            }))
            // Update the node with children
            const updateNodes = (nodes: FileNode[]): FileNode[] =>
              nodes.map((n) => {
                if (n.path === node.path) return { ...n, children }
                if (n.children) return { ...n, children: updateNodes(n.children) }
                return n
              })
            setFileTree(updateNodes(fileTree))
          }
        } catch {
          // Ignore
        }
      }
    },
    [toggleFolder, fileTree, setFileTree]
  )

  const rootName = rootPath ? rootPath.split('/').pop() || rootPath : 'Explorer'

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate flex-1" title={rootPath || ''}>
            {rootName}
          </h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => loadDirectory()}
              title="Refresh"
              disabled={isLoading}
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={async () => {
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
                  setRootPath(folderPath)
                  loadDirectory(folderPath)
                } else {
                  const path = window.prompt('Enter directory path:', rootPath || '/Users/ding')
                  if (path) {
                    setRootPath(path)
                    loadDirectory(path)
                  }
                }
              }}
              title="Open folder"
            >
              <FolderInput className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="h-7 text-xs pl-7 bg-muted/50 border-transparent focus:border-border"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-400 bg-red-400/10">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="py-1">
          {isLoading && fileTree.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              Loading files...
            </div>
          ) : filteredTree.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              {searchQuery ? 'No files match your search' : 'Empty directory'}
            </div>
          ) : (
            filteredTree.map((node) => (
              <FileTreeNode
                key={node.id}
                node={node}
                depth={0}
                expandedFolders={expandedFolders}
                selectedFilePath={selectedFilePath}
                onToggleFolder={handleToggleFolder}
                onFileClick={handleFileClick}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function FileTreeNode({
  node,
  depth,
  expandedFolders,
  selectedFilePath,
  onToggleFolder,
  onFileClick,
}: {
  node: FileNode
  depth: number
  expandedFolders: Set<string>
  selectedFilePath: string | null
  onToggleFolder: (node: FileNode) => void
  onFileClick: (node: FileNode) => void
}) {
  const isExpanded = expandedFolders.has(node.path)
  const isSelected = selectedFilePath === node.path
  const isFolder = node.type === 'folder'

  const getIcon = () => {
    if (isFolder) {
      return isExpanded ? (
        <FolderOpen className="h-3.5 w-3.5 text-amber-500" />
      ) : (
        <Folder className="h-3.5 w-3.5 text-amber-500" />
      )
    }
    const ext = node.name.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'tsx':
      case 'jsx':
        return <File className="h-3.5 w-3.5 text-blue-400" />
      case 'ts':
      case 'js':
        return <File className="h-3.5 w-3.5 text-yellow-400" />
      case 'css':
      case 'scss':
        return <File className="h-3.5 w-3.5 text-purple-400" />
      case 'json':
        return <File className="h-3.5 w-3.5 text-green-400" />
      case 'md':
        return <File className="h-3.5 w-3.5 text-slate-400" />
      case 'py':
        return <File className="h-3.5 w-3.5 text-yellow-300" />
      case 'go':
        return <File className="h-3.5 w-3.5 text-cyan-400" />
      case 'rs':
        return <File className="h-3.5 w-3.5 text-orange-400" />
      case 'sh':
      case 'zsh':
      case 'bash':
        return <File className="h-3.5 w-3.5 text-emerald-400" />
      default:
        return <File className="h-3.5 w-3.5 text-muted-foreground" />
    }
  }

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-0.5 cursor-pointer text-xs hover:bg-accent/50 transition-colors ${
          isSelected ? 'bg-accent text-accent-foreground' : 'text-foreground/80'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (isFolder) {
            onToggleFolder(node)
          } else {
            onFileClick(node)
          }
        }}
      >
        {isFolder && (
          <span className="flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </span>
        )}
        {!isFolder && <span className="w-3" />}
        {getIcon()}
        <span className="truncate">{node.name}</span>
      </div>
      {isFolder && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              selectedFilePath={selectedFilePath}
              onToggleFolder={onToggleFolder}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function getLanguageFromName(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', go: 'go', rs: 'rust', java: 'java', c: 'c', cpp: 'cpp',
    css: 'css', scss: 'css', html: 'html', json: 'json', md: 'markdown',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', sh: 'bash', zsh: 'bash',
    bash: 'bash', txt: 'text', env: 'text', gitignore: 'text',
  }
  return map[ext || ''] || 'text'
}
