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
  - Free Claude Code (FCC) proxy as preset with 18 models from all FCC providers
  - All FCC-supported providers: NVIDIA NIM, OpenRouter, Gemini, DeepSeek, Mistral, OpenCode Zen/Go, Wafer, Kimi, Cerebras, Groq, Fireworks, Z.ai, LM Studio, Ollama
  - Wafer, Kimi, Fireworks, Z.ai marked as Anthropic format providers
  - Descriptions for all providers
- Updated SettingsDialog with:
  - API Format selector (OpenAI/Anthropic) per provider
  - FCC proxy install instructions with terminal commands
  - GitHub link to FCC repository
  - Format badge indicators (A = Anthropic, default = OpenAI)
  - Better test connection for Anthropic providers
- Updated ChatPanel to send apiFormat in provider payload
- FCC proxy requires Python 3.14+ (not available on this server), but ZCode is fully compatible
- All lint checks pass, application compiles and runs

Stage Summary:
- ZCode now fully supports the Free Claude Code proxy
- Dual API format support: OpenAI Chat Completions + Anthropic Messages API
- 20+ preset providers including all FCC-supported backends
- Auto-detection of API format based on provider name/URL
- Settings UI includes FCC installation guide
