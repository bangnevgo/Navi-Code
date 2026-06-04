import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface AgentSkill {
  id: string
  name: string
  description: string
  icon: string
  category: 'file' | 'terminal' | 'web' | 'code' | 'system'
  enabled: boolean
  requiresConfirmation: boolean
  apiEndpoint?: string
}

export const AVAILABLE_SKILLS: AgentSkill[] = [
  {
    id: 'file-read',
    name: 'Read File',
    description: 'Read file contents from the local filesystem',
    icon: '📄',
    category: 'file',
    enabled: true,
    requiresConfirmation: false,
    apiEndpoint: '/api/fs/read',
  },
  {
    id: 'file-write',
    name: 'Write File',
    description: 'Write or create files on the local filesystem',
    icon: '✏️',
    category: 'file',
    enabled: true,
    requiresConfirmation: true,
    apiEndpoint: '/api/fs/write',
  },
  {
    id: 'file-list',
    name: 'List Directory',
    description: 'List files and directories in a given path',
    icon: '📁',
    category: 'file',
    enabled: true,
    requiresConfirmation: false,
    apiEndpoint: '/api/fs/list',
  },
  {
    id: 'file-delete',
    name: 'Delete File',
    description: 'Delete files from the local filesystem',
    icon: '🗑️',
    category: 'file',
    enabled: true,
    requiresConfirmation: true,
    apiEndpoint: '/api/fs/delete',
  },
  {
    id: 'file-search',
    name: 'Search Files',
    description: 'Search for files by name or content using ripgrep',
    icon: '🔍',
    category: 'file',
    enabled: true,
    requiresConfirmation: false,
    apiEndpoint: '/api/fs/search',
  },
  {
    id: 'terminal-exec',
    name: 'Execute Command',
    description: 'Run terminal commands on the local machine',
    icon: '🖥️',
    category: 'terminal',
    enabled: true,
    requiresConfirmation: true,
    apiEndpoint: '/api/terminal/exec',
  },
  {
    id: 'web-search',
    name: 'Web Search',
    description: 'Search the internet for current information',
    icon: '🌐',
    category: 'web',
    enabled: true,
    requiresConfirmation: false,
    apiEndpoint: '/api/web/search',
  },
  {
    id: 'web-scrape',
    name: 'Web Scrape',
    description: 'Extract content from web pages',
    icon: '🕷️',
    category: 'web',
    enabled: true,
    requiresConfirmation: false,
    apiEndpoint: '/api/web/scrape',
  },
  {
    id: 'code-analyze',
    name: 'Code Analysis',
    description: 'Analyze code for bugs, patterns, and improvements',
    icon: '🔬',
    category: 'code',
    enabled: true,
    requiresConfirmation: false,
  },
  {
    id: 'code-lint',
    name: 'Code Lint',
    description: 'Run linters on project files to find issues',
    icon: '🧹',
    category: 'code',
    enabled: true,
    requiresConfirmation: false,
    apiEndpoint: '/api/terminal/exec',
  },
  {
    id: 'system-info',
    name: 'System Info',
    description: 'Get system information (OS, memory, disk, etc.)',
    icon: '💻',
    category: 'system',
    enabled: true,
    requiresConfirmation: false,
    apiEndpoint: '/api/system/info',
  },
  {
    id: 'git-ops',
    name: 'Git Operations',
    description: 'Perform git operations (status, log, diff, etc.)',
    icon: '🔀',
    category: 'terminal',
    enabled: true,
    requiresConfirmation: true,
    apiEndpoint: '/api/terminal/exec',
  },
  {
    id: 'pkg-install',
    name: 'Package Install',
    description: 'Install npm/pip/bun packages',
    icon: '📦',
    category: 'terminal',
    enabled: true,
    requiresConfirmation: true,
    apiEndpoint: '/api/terminal/exec',
  },
  {
    id: 'ask-question',
    name: 'Ask Question',
    description: 'Ask the user a clarifying question or request feedback',
    icon: '❓',
    category: 'system',
    enabled: true,
    requiresConfirmation: false,
  },
  {
    id: 'start-subagent',
    name: 'Start Subagent',
    description: 'Spawn a specialized subagent to perform a subtask',
    icon: '🤖',
    category: 'system',
    enabled: true,
    requiresConfirmation: true,
  },
]

interface SkillState {
  skills: AgentSkill[]
  activeSkillCalls: SkillCall[]

  // Actions
  toggleSkill: (id: string) => void
  enableAllSkills: () => void
  disableAllSkills: () => void
  addSkillCall: (call: Omit<SkillCall, 'id' | 'timestamp'>) => string
  updateSkillCall: (id: string, updates: Partial<SkillCall>) => void
  clearSkillCalls: () => void
  getEnabledSkills: () => AgentSkill[]
}

export interface SkillCall {
  id: string
  skillId: string
  skillName: string
  input: string
  output?: string
  status: 'pending' | 'running' | 'completed' | 'error' | 'awaiting-confirmation'
  timestamp: number
  error?: string
}

export const useSkillStore = create<SkillState>()(
  persist(
    (set, get) => ({
      skills: AVAILABLE_SKILLS,
      activeSkillCalls: [],

      toggleSkill: (id) =>
        set((state) => ({
          skills: state.skills.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
        })),

      enableAllSkills: () =>
        set((state) => ({
          skills: state.skills.map((s) => ({ ...s, enabled: true })),
        })),

      disableAllSkills: () =>
        set((state) => ({
          skills: state.skills.map((s) => ({ ...s, enabled: false })),
        })),

      addSkillCall: (call) => {
        const id = `call-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
        set((state) => ({
          activeSkillCalls: [
            ...state.activeSkillCalls,
            { ...call, id, timestamp: Date.now() },
          ],
        }))
        return id
      },

      updateSkillCall: (id, updates) =>
        set((state) => ({
          activeSkillCalls: state.activeSkillCalls.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),

      clearSkillCalls: () => set({ activeSkillCalls: [] }),

      getEnabledSkills: () => get().skills.filter((s) => s.enabled),
    }),
    {
      name: 'navicode-skills',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        skills: state.skills.map((s) => ({ ...s, enabled: s.enabled })),
      }),
    }
  )
)
