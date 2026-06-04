import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  model?: string
  codeBlocks?: CodeBlock[]
  isStreaming?: boolean
}

export interface CodeBlock {
  id: string
  language: string
  code: string
  filename?: string
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  model: string
}

interface ChatState {
  conversations: Conversation[]
  activeConversationId: string | null
  isStreaming: boolean
  selectedModel: string

  // Actions
  setSelectedModel: (model: string) => void
  createConversation: () => string
  deleteConversation: (id: string) => void
  setActiveConversation: (id: string) => void
  addMessage: (conversationId: string, message: ChatMessage) => void
  updateMessage: (conversationId: string, messageId: string, updates: Partial<ChatMessage>) => void
  appendToMessage: (conversationId: string, messageId: string, content: string) => void
  setStreaming: (streaming: boolean) => void
  setMessages: (conversationId: string, messages: ChatMessage[]) => void
  getActiveConversation: () => Conversation | undefined
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  isStreaming: false,
  selectedModel: 'glm-4-plus',

  setSelectedModel: (model) => set({ selectedModel: model }),

  createConversation: () => {
    const id = `conv-${Date.now()}`
    const conversation: Conversation = {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: get().selectedModel,
    }
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeConversationId: id,
    }))
    return id
  },

  deleteConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      activeConversationId:
        state.activeConversationId === id
          ? state.conversations.find((c) => c.id !== id)?.id ?? null
          : state.activeConversationId,
    })),

  setActiveConversation: (id) => set({ activeConversationId: id }),

  addMessage: (conversationId, message) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c
        const messages = [...c.messages, message]
        const title =
          c.messages.length === 0 && message.role === 'user'
            ? message.content.slice(0, 40) + (message.content.length > 40 ? '...' : '')
            : c.title
        return { ...c, messages, title, updatedAt: Date.now() }
      }),
    })),

  updateMessage: (conversationId, messageId, updates) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c
        return {
          ...c,
          messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...updates } : m)),
          updatedAt: Date.now(),
        }
      }),
    })),

  appendToMessage: (conversationId, messageId, content) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId) return c
        return {
          ...c,
          messages: c.messages.map((m) =>
            m.id === messageId ? { ...m, content: m.content + content } : m
          ),
        }
      }),
    })),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  setMessages: (conversationId, messages) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, messages, updatedAt: Date.now() } : c
      ),
    })),

  getActiveConversation: () => {
    const state = get()
    return state.conversations.find((c) => c.id === state.activeConversationId)
  },
}))
