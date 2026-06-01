import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface ProviderConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
  isActive: boolean
  icon?: string
  type: 'builtin' | 'custom'
  headers?: Record<string, string>
}

export const PRESET_PROVIDERS: Omit<ProviderConfig, 'id' | 'apiKey' | 'isActive'>[] = [
  {
    name: 'ZCode (Built-in)',
    baseUrl: '',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4-long'],
    type: 'builtin',
    icon: '🤖',
  },
  {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini', 'o3-mini'],
    type: 'custom',
    icon: '🟢',
  },
  {
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    models: ['meta/llama-3.3-70b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct', 'mistralai/mixtral-8x22b-instruct-v0.1', 'google/gemma-2-27b-it'],
    type: 'custom',
    icon: '🟩',
  },
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['anthropic/claude-sonnet-4', 'google/gemini-2.5-pro', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-r1', 'qwen/qwen-2.5-72b-instruct'],
    type: 'custom',
    icon: '🟣',
  },
  {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    type: 'custom',
    icon: '⚡',
  },
  {
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    models: ['meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1', 'togethercomputer/RedPajama-INCITE-7B-Chat'],
    type: 'custom',
    icon: '🔵',
  },
  {
    name: 'Anthropic (Direct)',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
    type: 'custom',
    icon: '🟤',
    headers: { 'anthropic-version': '2023-06-01' },
  },
  {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    type: 'custom',
    icon: '🔵',
  },
  {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
    type: 'custom',
    icon: '🔷',
  },
]

interface ProviderState {
  providers: ProviderConfig[]
  activeProviderId: string
  selectedModel: string

  // Actions
  addProvider: (provider: Omit<ProviderConfig, 'id'>) => string
  updateProvider: (id: string, updates: Partial<ProviderConfig>) => void
  removeProvider: (id: string) => void
  setActiveProvider: (id: string) => void
  setSelectedModel: (model: string) => void
  getActiveProvider: () => ProviderConfig | undefined
  getAllModels: () => { providerId: string; providerName: string; model: string }[]
}

const defaultProviders: ProviderConfig[] = [
  {
    id: 'builtin-zcode',
    name: 'ZCode (Built-in)',
    baseUrl: '',
    apiKey: '',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4-long'],
    isActive: true,
    icon: '🤖',
    type: 'builtin',
  },
  ...PRESET_PROVIDERS.filter((p) => p.type === 'custom').map((p, i) => ({
    ...p,
    id: `preset-${i}`,
    apiKey: '',
    isActive: false,
  })),
]

export const useProviderStore = create<ProviderState>()(
  persist(
    (set, get) => ({
      providers: defaultProviders,
      activeProviderId: 'builtin-zcode',
      selectedModel: 'glm-4-plus',

      addProvider: (provider) => {
        const id = `provider-${Date.now()}`
        set((state) => ({
          providers: [...state.providers, { ...provider, id }],
        }))
        return id
      },

      updateProvider: (id, updates) =>
        set((state) => ({
          providers: state.providers.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),

      removeProvider: (id) =>
        set((state) => ({
          providers: state.providers.filter((p) => p.id !== id),
          activeProviderId: state.activeProviderId === id ? 'builtin-zcode' : state.activeProviderId,
        })),

      setActiveProvider: (id) => {
        const provider = get().providers.find((p) => p.id === id)
        set({
          activeProviderId: id,
          selectedModel: provider?.models[0] || 'glm-4-plus',
        })
      },

      setSelectedModel: (model) => set({ selectedModel: model }),

      getActiveProvider: () => {
        const state = get()
        return state.providers.find((p) => p.id === state.activeProviderId)
      },

      getAllModels: () => {
        const state = get()
        return state.providers.flatMap((p) =>
          p.models.map((model) => ({
            providerId: p.id,
            providerName: p.name,
            model,
          }))
        )
      },
    }),
    {
      name: 'zcode-providers',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        providers: state.providers.map((p) => ({ ...p, apiKey: btoa(p.apiKey) })),
        activeProviderId: state.activeProviderId,
        selectedModel: state.selectedModel,
      }),
      merge: (persistedState: Record<string, unknown>, currentState) => {
        const ps = persistedState as Partial<ProviderState>
        if (ps.providers) {
          ps.providers = ps.providers.map((p) => ({
            ...p,
            apiKey: typeof p.apiKey === 'string' ? atob(p.apiKey) : '',
          }))
        }
        return { ...currentState, ...ps }
      },
    }
  )
)
