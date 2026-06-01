---
Task ID: 3
Agent: Main Agent
Task: Ensure ZCode can use Free Claude Code (FCC) proxy from https://github.com/Alishahryar1/free-claude-code

Work Log:
- Read and analyzed the FCC proxy repository - it's an Anthropic-compatible proxy with 17+ providers
- Key discovery: FCC proxy exposes Anthropic Messages API format (/v1/messages), not OpenAI Chat Completions
- Added Anthropic Messages API streaming support to /api/chat/route.ts
  - New handler: handleAnthropicProvider() with proper SSE parsing for Anthropic events
  - Supports: content_block_delta, thinking_delta, message_stop, error events
  - Converts OpenAI messages format to Anthropic format (separate system prompt, user/assistant roles)
- Added API format detection: detectApiFormat() auto-detects Anthropic vs OpenAI based on provider name/URL
- Updated provider-store.ts with:
  - New `apiFormat` field: 'openai' | 'anthropic' | 'builtin'
  - Free Claude Code (FCC) proxy as preset with 32 models from all FCC providers
  - All FCC-supported providers: NVIDIA NIM, OpenRouter, Gemini, DeepSeek, Mistral, OpenCode Zen/Go, Wafer, Kimi, Cerebras, Groq, Fireworks, Z.ai, LM Studio, llama.cpp, Ollama
  - Wafer, Kimi, Fireworks, Z.ai marked as Anthropic format providers
  - Descriptions for all providers
  - FCC_DEFAULT_API_KEY = "freecc" as default auth token
  - fetchModels() action for model discovery
  - isFetchingModels/fetchModelsError state tracking
- Updated /api/chat/route.ts with:
  - ProviderInfo interface for proper typing
  - isFccProxy() helper function
  - Higher max_tokens for FCC (16384 vs 8192 for Anthropic direct)
  - Thinking block support for Claude models via FCC
  - FCC-specific error messages (proxy not running, auth failed, model not found, upstream errors, rate limits)
  - Both x-api-key and Authorization headers for FCC compatibility
- Created /api/models/route.ts - Model discovery API
  - Fetches from provider's /v1/models (Anthropic) or /models (OpenAI) endpoint
  - Normalizes response formats (array, {data:[...]}, {models:[...]})
  - FCC-specific error messages
- Updated SettingsDialog with:
  - API Format selector (OpenAI/Anthropic) per provider
  - FCC Quick Setup Guide (collapsible with step-by-step instructions and copy buttons)
  - Fetch Models button for all providers
  - Improved Test Connection using /api/models endpoint first
  - FCC-specific error messages
  - Format badge indicators (A = Anthropic, default = OpenAI)
  - GitHub link to FCC repository
- Fixed TypeScript errors:
  - chat/route.ts: ProviderInfo interface replacing complex conditional type
  - SettingsDialog.tsx: modelsData undefined reference
  - provider-store.ts: merge function type compatibility
  - ChatPanel.tsx: tool execution Promise types
  - tools/route.ts, web/route.ts: web_scrape -> page_reader SDK function name
- Build successful, all API routes registered

Stage Summary:
- ZCode fully supports the Free Claude Code proxy
- Dual API format support: OpenAI Chat Completions + Anthropic Messages API
- 20+ preset providers including all FCC-supported backends
- 32 FCC proxy model slugs pre-configured
- Auto-detection of API format based on provider name/URL
- Model discovery via /api/models endpoint
- Collapsible FCC Setup Guide with copy-paste instructions
- FCC-specific error messages for common issues
- Application builds successfully
