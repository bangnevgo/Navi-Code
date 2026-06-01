import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ApiFormat = 'openai' | 'anthropic' | 'builtin'

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
  apiFormat?: ApiFormat
  description?: string
}

export const PRESET_PROVIDERS: Omit<ProviderConfig, 'id' | 'apiKey' | 'isActive'>[] = [
  // ─── Built-in ───
  {
    name: 'ZCode (Built-in)',
    baseUrl: '',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4-long'],
    type: 'builtin',
    icon: '🤖',
    apiFormat: 'builtin',
    description: 'Default ZCode AI - no setup required',
  },
  // ─── Free Claude Code Proxy ───
  {
    name: 'Free Claude Code (FCC Proxy)',
    baseUrl: 'http://localhost:8082',
    models: [
      'nvidia_nim/nvidia/nemotron-3-super-120b-a12b',
      'nvidia_nim/z-ai/glm5.1',
      'nvidia_nim/moonshotai/kimi-k2.5',
      'open_router/openrouter/free',
      'open_router/anthropic/claude-sonnet-4',
      'gemini/models/gemini-3.1-flash-lite',
      'deepseek/deepseek-chat',
      'opencode/gpt-5.3-codex',
      'opencode/claude-sonnet-4',
      'opencode/deepseek-v4-flash-free',
      'opencode_go/minimax-m2.7',
      'wafer/DeepSeek-V4-Pro',
      'kimi/kimi-k2.5',
      'cerebras/gpt-oss-120b',
      'groq/llama-3.3-70b-versatile',
      'zai/glm-5.1',
      'lmstudio/local-model',
      'ollama/llama3.1',
    ],
    type: 'custom',
    icon: '🆓',
    apiFormat: 'anthropic',
    headers: {},
    description: 'Free Claude Code proxy - 17+ providers via local proxy',
  },
  // ─── Direct Cloud Providers (OpenAI format) ───
  {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini', 'o3-mini'],
    type: 'custom',
    icon: '🟢',
    apiFormat: 'openai',
    description: 'OpenAI GPT models',
  },
  {
    name: 'NVIDIA NIM (Direct)',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    models: ['meta/llama-3.3-70b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct', 'mistralai/mixtral-8x22b-instruct-v0.1', 'google/gemma-2-27b-it'],
    type: 'custom',
    icon: '🟩',
    apiFormat: 'openai',
    description: 'NVIDIA NIM inference (OpenAI-compatible)',
  },
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['anthropic/claude-sonnet-4', 'google/gemini-2.5-pro', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-r1', 'qwen/qwen-2.5-72b-instruct', 'openrouter/free'],
    type: 'custom',
    icon: '🟣',
    apiFormat: 'openai',
    description: 'OpenRouter - access 100+ models',
  },
  {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    type: 'custom',
    icon: '⚡',
    apiFormat: 'openai',
    description: 'Groq - ultra-fast inference',
  },
  {
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    models: ['meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
    type: 'custom',
    icon: '🔵',
    apiFormat: 'openai',
    description: 'Together AI - open source models',
  },
  {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    type: 'custom',
    icon: '🐋',
    apiFormat: 'openai',
    description: 'DeepSeek AI models',
  },
  {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
    type: 'custom',
    icon: '🔷',
    apiFormat: 'openai',
    description: 'Google Gemini via OpenAI-compat endpoint',
  },
  {
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    models: ['llama3.1-8b', 'gpt-oss-120b'],
    type: 'custom',
    icon: '🧠',
    apiFormat: 'openai',
    description: 'Cerebras inference - fast reasoning',
  },
  {
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    models: ['devstral-small-latest', 'mistral-small-latest', 'codestral-latest'],
    type: 'custom',
    icon: '🌀',
    apiFormat: 'openai',
    description: 'Mistral AI models',
  },
  // ─── Anthropic Messages API format providers ───
  {
    name: 'Anthropic (Direct)',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-opus-4-20250514'],
    type: 'custom',
    icon: '🟤',
    apiFormat: 'anthropic',
    headers: { 'anthropic-version': '2023-06-01' },
    description: 'Anthropic Claude - direct API',
  },
  {
    name: 'OpenCode Zen',
    baseUrl: 'https://opencode.ai/zen',
    models: ['gpt-5.3-codex', 'claude-sonnet-4', 'deepseek-v4-flash-free', 'gemini-3-flash', 'big-pickle', 'glm-5.1'],
    type: 'custom',
    icon: '🔮',
    apiFormat: 'openai',
    description: 'OpenCode Zen - curated model gateway',
  },
  {
    name: 'Wafer',
    baseUrl: 'https://pass.wafer.ai',
    models: ['DeepSeek-V4-Pro', 'MiniMax-M2.7', 'Qwen3.5-397B-A17B', 'GLM-5.1'],
    type: 'custom',
    icon: '🍩',
    apiFormat: 'anthropic',
    description: 'Wafer - Anthropic-compatible gateway',
  },
  {
    name: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.ai/anthropic',
    models: ['kimi-k2.5'],
    type: 'custom',
    icon: '🌙',
    apiFormat: 'anthropic',
    description: 'Kimi by Moonshot - Anthropic-compat',
  },
  {
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference',
    models: ['accounts/fireworks/models/llama-v3p3-70b-instruct'],
    type: 'custom',
    icon: '🎆',
    apiFormat: 'anthropic',
    description: 'Fireworks AI - Anthropic Messages API',
  },
  {
    name: 'Z.ai',
    baseUrl: 'https://api.z.ai/api/anthropic',
    models: ['glm-5.1', 'glm-5-turbo'],
    type: 'custom',
    icon: '⚡',
    apiFormat: 'anthropic',
    description: 'Z.ai - Anthropic-compatible endpoint',
  },
  // ─── Local Providers ───
  {
    name: 'LM Studio (Local)',
    baseUrl: 'http://localhost:1234/v1',
    models: ['local-model'],
    type: 'custom',
    icon: '🏠',
    apiFormat: 'openai',
    description: 'LM Studio local server',
  },
  {
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3.1', 'codellama', 'mistral'],
    type: 'custom',
    icon: '🦙',
    apiFormat: 'openai',
    description: 'Ollama local inference',
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
    apiFormat: 'builtin',
    description: 'Default ZCode AI - no setup required',
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
