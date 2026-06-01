import { create } from 'zustand'

export interface EditorFile {
  id: string
  name: string
  path: string
  content: string
  language: string
  isDirty: boolean
}

interface EditorState {
  openFiles: EditorFile[]
  activeFileId: string | null
  showTerminal: boolean
  showEditor: boolean
  terminalOutput: TerminalLine[]

  // Actions
  openFile: (file: Omit<EditorFile, 'id' | 'isDirty'>) => void
  closeFile: (id: string) => void
  setActiveFile: (id: string) => void
  updateFileContent: (id: string, content: string) => void
  toggleTerminal: () => void
  setShowEditor: (show: boolean) => void
  addTerminalLine: (line: Omit<TerminalLine, 'id' | 'timestamp'>) => void
  clearTerminal: () => void
}

export interface TerminalLine {
  id: string
  type: 'input' | 'output' | 'error' | 'info'
  content: string
  timestamp: number
}

export const useEditorStore = create<EditorState>((set, get) => ({
  openFiles: [],
  activeFileId: null,
  showTerminal: true,
  showEditor: false,
  terminalOutput: [],

  openFile: (file) => {
    const existing = get().openFiles.find((f) => f.path === file.path)
    if (existing) {
      set({ activeFileId: existing.id })
      return
    }
    const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const newFile: EditorFile = { ...file, id, isDirty: false }
    set((state) => ({
      openFiles: [...state.openFiles, newFile],
      activeFileId: id,
      showEditor: true,
    }))
  },

  closeFile: (id) =>
    set((state) => {
      const remaining = state.openFiles.filter((f) => f.id !== id)
      const newActive =
        state.activeFileId === id
          ? remaining.length > 0
            ? remaining[remaining.length - 1].id
            : null
          : state.activeFileId
      return {
        openFiles: remaining,
        activeFileId: newActive,
        showEditor: remaining.length > 0,
      }
    }),

  setActiveFile: (id) => set({ activeFileId: id }),

  updateFileContent: (id, content) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.id === id ? { ...f, content, isDirty: true } : f
      ),
    })),

  toggleTerminal: () => set((state) => ({ showTerminal: !state.showTerminal })),

  setShowEditor: (show) => set({ showEditor: show }),

  addTerminalLine: (line) =>
    set((state) => ({
      terminalOutput: [
        ...state.terminalOutput,
        { ...line, id: `term-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, timestamp: Date.now() },
      ],
    })),

  clearTerminal: () => set({ terminalOutput: [] }),
}))
