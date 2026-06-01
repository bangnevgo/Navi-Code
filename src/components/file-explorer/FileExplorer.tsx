'use client'

import { useFileStore, type FileNode } from '@/stores/file-store'
import { useEditorStore } from '@/stores/editor-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useState, useMemo, useCallback } from 'react'

export function FileExplorer() {
  const { fileTree, expandedFolders, selectedFilePath, toggleFolder, selectFile } = useFileStore()
  const { openFile } = useEditorStore()
  const [searchQuery, setSearchQuery] = useState('')

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
        }
        return acc
      }, [])
    }
    return filterNodes(fileTree)
  }, [fileTree, searchQuery])

  const handleFileClick = useCallback(
    (node: FileNode) => {
      selectFile(node.path)
      if (node.content !== undefined) {
        openFile({
          name: node.name,
          path: node.path,
          content: node.content,
          language: node.language || 'text',
        })
      }
    },
    [selectFile, openFile]
  )

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Explorer
        </h3>
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
      <ScrollArea className="flex-1">
        <div className="py-1">
          {filteredTree.map((node) => (
            <FileTreeNode
              key={node.id}
              node={node}
              depth={0}
              expandedFolders={expandedFolders}
              selectedFilePath={selectedFilePath}
              onToggleFolder={toggleFolder}
              onFileClick={handleFileClick}
            />
          ))}
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
  onToggleFolder: (path: string) => void
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
        return <File className="h-3.5 w-3.5 text-purple-400" />
      case 'json':
        return <File className="h-3.5 w-3.5 text-green-400" />
      case 'md':
        return <File className="h-3.5 w-3.5 text-slate-400" />
      default:
        return <File className="h-3.5 w-3.5 text-muted-foreground" />
    }
  }

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer text-xs hover:bg-accent/50 transition-colors ${
          isSelected ? 'bg-accent text-accent-foreground' : 'text-foreground/80'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (isFolder) {
            onToggleFolder(node.path)
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
