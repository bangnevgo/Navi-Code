import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

interface ChatMessageInput {
  role: string
  content: string
}

type ApiFormat = 'openai' | 'anthropic' | 'builtin'

export async function POST(request: NextRequest) {
  try {
    const {
      messages,
      model,
      provider,
      enabledSkills,
    }: {
      messages: ChatMessageInput[]
      model: string
      provider?: {
        id: string
        name: string
        baseUrl: string
        apiKey: string
        type: 'builtin' | 'custom'
        headers?: Record<string, string>
        apiFormat?: ApiFormat
      }
      enabledSkills?: string[]
    } = await request.json()

    // Build skills context
    const skillsContext = enabledSkills?.length
      ? `\n\nYou have access to the following tools/skills that you can invoke by responding with special JSON blocks:\n\n${enabledSkills
          .map((s) => `- ${s}`)
          .join('\n')}\n\nTo use a tool, respond with a JSON block in this format:\n\`\`\`tool\n{"tool": "tool-name", "input": {"key": "value"}}\n\`\`\`\n\nAvailable tools:\n- \`file_read\`: Read a file. Input: {"path": "/path/to/file"}\n- \`file_write\`: Write/create a file. Input: {"path": "/path/to/file", "content": "file content"}\n- \`file_list\`: List directory contents. Input: {"path": "/path/to/dir"}\n- \`file_delete\`: Delete a file. Input: {"path": "/path/to/file"}\n- \`file_search\`: Search files by name/content. Input: {"query": "search term", "path": "/search/dir"}\n- \`terminal_exec\`: Execute a terminal command. Input: {"command": "shell command", "cwd": "/working/dir"}\n- \`web_search\`: Search the web. Input: {"query": "search query"}\n- \`web_scrape\`: Scrape a web page. Input: {"url": "https://example.com"}\n- \`system_info\`: Get system information. Input: {}\n\nWhen you need to use a tool, include the JSON block in your response. The user's system will execute the tool and return the result. You can then continue with your response based on the tool output.\n\nIMPORTANT: For file operations and terminal commands, always confirm with the user before executing destructive operations (delete, overwrite).`
      : ''

    const systemPrompt = `You are ZCode, an expert AI coding assistant that combines the best features of Claude Code, OpenAI Codex, and OpenCode. You help developers with:

1. **Code Generation**: Write clean, efficient, well-documented code in any language
2. **Code Review**: Analyze code for bugs, performance issues, and best practices
3. **Debugging**: Help identify and fix errors in code
4. **Refactoring**: Suggest improvements to code structure and readability
5. **Architecture**: Help design scalable software architectures
6. **Explanation**: Explain complex code and concepts clearly
7. **File Operations**: Read, write, search, and manage files on the user's local filesystem
8. **Terminal Commands**: Execute shell commands on the user's local machine
9. **Web Search**: Search the internet for current information
10. **System Info**: Access system information about the user's machine

When providing code:
- Always use markdown code blocks with the appropriate language tag
- Include a filename comment at the top when relevant (e.g., // filepath: src/app/page.tsx)
- Write production-quality code with proper error handling
- Follow best practices and design patterns for the given language/framework
- Add helpful comments for complex logic

Be concise but thorough. If asked to modify code, show the complete modified file.
When suggesting file operations, use the format:
- CREATE: filename
- EDIT: filename
- DELETE: filename
${skillsContext}
You are running inside a modern IDE-like web interface called ZCode. The user can see their project files and edit code directly.`

    // Determine API format
    const apiFormat: ApiFormat = provider?.apiFormat || detectApiFormat(provider?.name || '', provider?.baseUrl || '')

    // If using built-in provider, use z-ai-web-dev-sdk
    if (!provider || provider.type === 'builtin' || !provider.baseUrl || !provider.apiKey) {
      return handleBuiltinProvider(allMessages(systemPrompt, messages), model)
    }

    // Route to correct handler based on API format
    if (apiFormat === 'anthropic') {
      return handleAnthropicProvider(provider, model, systemPrompt, messages)
    }

    return handleOpenAIProvider(provider, model, allMessages(systemPrompt, messages))
  } catch (error) {
    console.error('Chat API error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function allMessages(systemPrompt: string, messages: ChatMessageInput[]) {
  return [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]
}

function detectApiFormat(name: string, baseUrl: string): ApiFormat {
  const nameLower = name.toLowerCase()
  const urlLower = baseUrl.toLowerCase()

  // Anthropic Messages API format providers
  if (
    nameLower.includes('anthropic') ||
    nameLower.includes('free-claude') ||
    nameLower.includes('fcc') ||
    nameLower.includes('free claude') ||
    urlLower.includes('anthropic') ||
    urlLower.includes(':8082') ||
    urlLower.includes('wafer') ||
    urlLower.includes('moonshot') ||
    urlLower.includes('fireworks')
  ) {
    return 'anthropic'
  }

  return 'openai'
}

// ──────────────────────────────────────────
// Built-in provider (z-ai-web-dev-sdk)
// ──────────────────────────────────────────
async function handleBuiltinProvider(
  messages: { role: string; content: string }[],
  model: string
) {
  const zai = await ZAI.create()
  const completion = await zai.chat.completions.create({
    messages,
    model: model || 'glm-4-plus',
    stream: true,
  })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of completion) {
          const content = chunk.choices?.[0]?.delta?.content
          if (content) {
            controller.enqueue(encoder.encode(content))
          }
        }
        controller.close()
      } catch (error) {
        console.error('Stream error:', error)
        controller.error(error)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// ──────────────────────────────────────────
// OpenAI Chat Completions format
// ──────────────────────────────────────────
async function handleOpenAIProvider(
  provider: NonNullable<Parameters<typeof POST>[0] extends { json: () => Promise<infer B> } ? B extends { provider?: infer P } ? P : never : never>,
  model: string,
  messages: { role: string; content: string }[]
) {
  const baseUrl = (provider.baseUrl || '').replace(/\/$/, '')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${provider.apiKey}`,
    ...provider.headers,
  }

  if (provider.name?.toLowerCase().includes('openrouter')) {
    headers['HTTP-Referer'] = 'https://zcode.dev'
    headers['X-Title'] = 'ZCode AI Assistant'
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return NextResponse.json(
      { error: `Provider API error (${response.status}): ${errorText}` },
      { status: response.status }
    )
  }

  return proxyOpenAIStream(response)
}

function proxyOpenAIStream(response: Response): Response {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const reader = response.body?.getReader()
        if (!reader) {
          controller.error(new Error('No reader available'))
          return
        }

        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed === 'data: [DONE]') continue
            if (!trimmed.startsWith('data: ')) continue

            try {
              const json = JSON.parse(trimmed.slice(6))
              const content = json.choices?.[0]?.delta?.content
              if (content) {
                controller.enqueue(encoder.encode(content))
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
        controller.close()
      } catch (error) {
        console.error('OpenAI stream error:', error)
        controller.error(error)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// ──────────────────────────────────────────
// Anthropic Messages API format
// Used by: Free Claude Code proxy, Anthropic direct,
//          Wafer, Kimi/Moonshot, Fireworks, Z.ai
// ──────────────────────────────────────────
async function handleAnthropicProvider(
  provider: NonNullable<Parameters<typeof POST>[0] extends { json: () => Promise<infer B> } ? B extends { provider?: infer P } ? P : never : never>,
  model: string,
  systemPrompt: string,
  messages: ChatMessageInput[]
) {
  const baseUrl = (provider.baseUrl || '').replace(/\/$/, '')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': provider.apiKey,
    'anthropic-version': '2023-06-01',
    ...provider.headers,
  }

  // For FCC proxy and other Anthropic proxies, also set Bearer auth
  // since some proxies accept both formats
  if (!headers['Authorization']) {
    headers['Authorization'] = `Bearer ${provider.apiKey}`
  }

  // Convert messages to Anthropic format
  // Anthropic uses: system (separate), user, assistant
  const anthropicMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

  // Determine the model to send
  // For FCC proxy, strip the provider prefix (e.g., "nvidia_nim/model" -> "model")
  // but keep the full slug for other Anthropic-compatible providers
  let modelToUse = model
  if (baseUrl.includes(':8082') || baseUrl.includes('free-claude') || provider.name?.toLowerCase().includes('fcc')) {
    // FCC proxy expects the full slug with provider prefix
    modelToUse = model
  }

  // Determine max tokens - Anthropic requires this
  const maxTokens = modelToUse.includes('claude') ? 8192 : 4096

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelToUse,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: anthropicMessages,
      stream: true,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return NextResponse.json(
      { error: `Anthropic API error (${response.status}): ${errorText}` },
      { status: response.status }
    )
  }

  return proxyAnthropicStream(response)
}

function proxyAnthropicStream(response: Response): Response {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const reader = response.body?.getReader()
        if (!reader) {
          controller.error(new Error('No reader available'))
          return
        }

        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data: ')) continue

            const data = trimmed.slice(6)

            try {
              const json = JSON.parse(data)

              // Anthropic SSE event types
              if (json.type === 'content_block_delta') {
                const text = json.delta?.text
                if (text) {
                  controller.enqueue(encoder.encode(text))
                }
              }
              // Also handle thinking blocks (for Claude reasoning)
              else if (json.type === 'thinking_delta') {
                const thinking = json.delta?.thinking
                if (thinking) {
                  controller.enqueue(encoder.encode(thinking))
                }
              }
              // Handle message_stop (end of stream)
              else if (json.type === 'message_stop') {
                // Stream complete
              }
              // Handle errors
              else if (json.type === 'error') {
                const errMsg = json.error?.message || JSON.stringify(json.error)
                controller.enqueue(encoder.encode(`\n[Error: ${errMsg}]`))
              }
            } catch {
              // Skip non-JSON lines or malformed data
            }
          }
        }
        controller.close()
      } catch (error) {
        console.error('Anthropic stream error:', error)
        controller.error(error)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
