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

// Real models from the running FCC proxy at localhost:8082
// Format: anthropic/<provider>/<model> (FCC routing format)
export const FCC_PROXY_MODELS = [
  // ── Kimi / Moonshot ──
  'anthropic/kimi/kimi-k2.6',
  'anthropic/kimi/kimi-k2.5',
  'anthropic/kimi/moonshot-v1-128k',
  'anthropic/kimi/moonshot-v1-auto',
  // ── OpenCode (free tiers only) ──
  'anthropic/opencode/deepseek-v4-flash-free',
  'anthropic/opencode/mimo-v2.5-free',
  'anthropic/opencode/minimax-m3-free',
  'anthropic/opencode/nemotron-3-super-free',
  'anthropic/opencode/qwen3.6-plus-free',
  // ── OpenRouter (free tiers & owl-alpha only) ──
  'anthropic/open_router/openrouter/free',
  'anthropic/open_router/openrouter/owl-alpha',
  'anthropic/open_router/moonshotai/kimi-k2.6:free',
  // ── Z.ai ──
  'anthropic/zai/glm-4.6',
  'anthropic/zai/glm-4.5',
  'anthropic/zai/glm-4.5-air',
  // ── DeepSeek ──
  'anthropic/deepseek/deepseek-v4-pro',
  'anthropic/deepseek/deepseek-v4-flash',
  // ── NVIDIA NIM (highlights) ──
  'anthropic/nvidia_nim/nvidia/nemotron-3-super-120b-a12b',
  'anthropic/nvidia_nim/moonshotai/kimi-k2.6',
  'anthropic/nvidia_nim/deepseek-ai/deepseek-v4-pro',
  'anthropic/nvidia_nim/deepseek-ai/deepseek-v4-flash',
  'anthropic/nvidia_nim/meta/llama-3.3-70b-instruct',
  'anthropic/nvidia_nim/mistralai/devstral-small-2505',
  'anthropic/nvidia_nim/qwen/qwen3-235b-a22b',
]

export const FCC_DEFAULT_API_KEY = 'freecc'

export const PRESET_PROVIDERS: Omit<ProviderConfig, 'id' | 'apiKey' | 'isActive'>[] = [
  // ─── Built-in ───
  {
    name: 'NaviCode (Built-in)',
    baseUrl: '',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4-long'],
    type: 'builtin',
    icon: '🤖',
    apiFormat: 'builtin',
    description: 'Default NaviCode AI - no setup required',
  },
  // ─── Free Claude Code Proxy ───
  {
    name: 'Free Claude Code (FCC Proxy)',
    baseUrl: 'http://localhost:8082',
    models: FCC_PROXY_MODELS,
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
  {
    name: 'Higgsfield AI',
    baseUrl: 'https://api.higgsfield.ai/v1',
    models: ['soul-v2', 'cinema-studio', 'flux-dev'],
    type: 'custom',
    icon: '🎥',
    apiFormat: 'openai',
    description: 'Higgsfield AI - cinematic video & image generation',
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
  isFetchingModels: Record<string, boolean>
  fetchModelsError: Record<string, string | null>

  // Actions
  addProvider: (provider: Omit<ProviderConfig, 'id'>) => string
  updateProvider: (id: string, updates: Partial<ProviderConfig>) => void
  removeProvider: (id: string) => void
  setActiveProvider: (id: string) => void
  setSelectedModel: (model: string) => void
  getActiveProvider: () => ProviderConfig | undefined
  getAllModels: () => { providerId: string; providerName: string; model: string }[]
  fetchModels: (providerId: string) => Promise<string[]>
}

const defaultProviders: ProviderConfig[] = [
  {
    id: 'builtin-navicode',
    name: 'NaviCode (Built-in)',
    baseUrl: '',
    apiKey: '',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4-long'],
    isActive: false,
    icon: '🤖',
    type: 'builtin',
    apiFormat: 'builtin',
    description: 'Default NaviCode AI - no setup required',
  },
  {
    id: 'fcc-proxy',
    name: 'Free Claude Code (FCC Proxy)',
    baseUrl: 'http://localhost:8082',
    apiKey: 'freecc',
    models: FCC_PROXY_MODELS,
    isActive: true,
    icon: '🆓',
    type: 'custom',
    apiFormat: 'anthropic',
    headers: {},
    description: 'Free Claude Code proxy — 749+ models via local proxy',
  },
  ...PRESET_PROVIDERS.filter((p) => p.type === 'custom' && p.name !== 'Free Claude Code (FCC Proxy)').map((p, i) => ({
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
      activeProviderId: 'fcc-proxy',
      selectedModel: 'anthropic/opencode/deepseek-v4-flash-free',
      isFetchingModels: {},
      fetchModelsError: {},

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
          activeProviderId: state.activeProviderId === id ? 'builtin-navicode' : state.activeProviderId,
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
        const provider = state.providers.find((p) => p.id === state.activeProviderId)
        // FCC proxy must always use 'freecc' as apiKey — force it unconditionally
        // to avoid corruption from localStorage merge
        if (provider && provider.id === 'fcc-proxy') {
          return { ...provider, apiKey: 'freecc' }
        }
        return provider
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

      fetchModels: async (providerId: string) => {
        const provider = get().providers.find((p) => p.id === providerId)
        if (!provider || provider.type === 'builtin') return []

        set((state) => ({
          isFetchingModels: { ...state.isFetchingModels, [providerId]: true },
          fetchModelsError: { ...state.fetchModelsError, [providerId]: null },
        }))

        try {
          const response = await fetch('/api/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              baseUrl: provider.baseUrl,
              apiKey: provider.apiKey,
              apiFormat: provider.apiFormat || 'openai',
            }),
          })

          const data = await response.json()

          if (!response.ok || data.error) {
            const errorMsg = data.error || `Failed to fetch models (HTTP ${response.status})`
            set((state) => ({
              isFetchingModels: { ...state.isFetchingModels, [providerId]: false },
              fetchModelsError: { ...state.fetchModelsError, [providerId]: errorMsg },
            }))
            return []
          }

          let modelIds: string[] = (data.models || []).map((m: { id: string }) => m.id)

          if (providerId === 'fcc-proxy') {
            modelIds = modelIds.filter((id) => {
              const lowerId = id.toLowerCase()
              // Filter opencode: only keep if it contains "free"
              if (lowerId.includes('opencode')) {
                return lowerId.includes('free')
              }
              // Filter open_router / openrouter: only keep if it contains "free" OR matches "openrouter/owl-alpha"
              if (lowerId.includes('open_router') || lowerId.includes('openrouter')) {
                return lowerId.includes('free') || lowerId.includes('openrouter/owl-alpha')
              }
              return true
            })
          }

          if (modelIds.length > 0) {
            set((state) => ({
              providers: state.providers.map((p) =>
                p.id === providerId ? { ...p, models: modelIds } : p
              ),
              isFetchingModels: { ...state.isFetchingModels, [providerId]: false },
              fetchModelsError: { ...state.fetchModelsError, [providerId]: null },
            }))
          } else {
            set((state) => ({
              isFetchingModels: { ...state.isFetchingModels, [providerId]: false },
              fetchModelsError: { ...state.fetchModelsError, [providerId]: 'No models found. The provider may not support model discovery.' },
            }))
          }

          return modelIds
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch models'
          set((state) => ({
            isFetchingModels: { ...state.isFetchingModels, [providerId]: false },
            fetchModelsError: { ...state.fetchModelsError, [providerId]: message },
          }))
          return []
        }
      },
    }),
    {
      name: 'navicode-providers',
      version: 6, // v6: add Higgsfield AI preset and merge default presets
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        providers: state.providers.map((p) => ({ ...p, apiKey: btoa(p.apiKey) })),
        activeProviderId: state.activeProviderId,
        selectedModel: state.selectedModel,
      }),
      migrate: (persistedState, version) => {
        // Version < 4: reset completely to clear corrupted apiKey data
        if (version < 4) {
          return {
            providers: defaultProviders,
            activeProviderId: 'fcc-proxy',
            selectedModel: 'anthropic/opencode/deepseek-v4-flash-free',
          }
        }
        if (version < 5) {
          const state = persistedState as Partial<ProviderState>
          if (state.providers) {
            state.providers = state.providers.map((p) => {
              if (p.id === 'fcc-proxy') {
                return { ...p, models: FCC_PROXY_MODELS }
              }
              return p
            })
          }
          return state
        }
        return persistedState as Partial<ProviderState>
      },
      merge: (persistedState: unknown, currentState) => {
        const ps = persistedState as Partial<ProviderState> & Record<string, unknown>
        if (ps.providers) {
          ps.providers = ps.providers.map((p) => {
            let decoded = ''
            if (typeof p.apiKey === 'string') {
              try { decoded = atob(p.apiKey) } catch { decoded = p.apiKey }
            }
            // FCC proxy must always be 'freecc' — override regardless of storage
            if (p.id === 'fcc-proxy') return { ...p, apiKey: 'freecc' }
            return { ...p, apiKey: decoded }
          })
          // Ensure fcc-proxy exists
          if (!ps.providers.some((p: ProviderConfig) => p.id === 'fcc-proxy')) {
            ps.providers = [defaultProviders[1], ...ps.providers]
          }

          // Merge missing default providers into local storage so new presets like Higgsfield show up automatically
          const existingNames = new Set(ps.providers.map((p) => p.name))
          const missingDefaults = currentState.providers.filter((p) => !existingNames.has(p.name))
          if (missingDefaults.length > 0) {
            ps.providers = [...ps.providers, ...missingDefaults]
          }
        }
        return { ...currentState, ...ps }
      },
    }

  )
)
