import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

export const dynamic = 'force-dynamic'

interface ChatMessageInput {
  role: string
  content: string
}

type ApiFormat = 'openai' | 'anthropic' | 'builtin'

/** Detect whether a provider is the Free Claude Code proxy */
function isFccProxy(name: string | undefined, baseUrl: string | undefined): boolean {
  const nameLower = (name || '').toLowerCase()
  const urlLower = (baseUrl || '').toLowerCase()
  return (
    nameLower.includes('fcc') ||
    nameLower.includes('free-claude') ||
    nameLower.includes('free claude') ||
    urlLower.includes(':8082')
  )
}

export async function POST(request: NextRequest) {
  try {
    const {
      messages,
      model,
      provider,
      enabledSkills,
      systemPromptOverride,
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
      systemPromptOverride?: string
    } = await request.json()

    // Expand slash commands into agent workflows
    if (messages && messages.length > 0) {
      const lastMessage = messages[messages.length - 1]
      if (lastMessage && lastMessage.role === 'user') {
        const text = lastMessage.content.trim()
        if (text.startsWith('/doctor')) {
          lastMessage.content = `Perform system diagnostics using the system_info tool. Output a comprehensive report checklist checking Node version, free RAM/memory, hostname, OS, and workspace status. Present it as a NaviCode System Doctor Report.`
        } else if (text.startsWith('/review')) {
          lastMessage.content = `Run terminal_exec tool with command "git diff" to review recent changes in the workspace. Perform a detailed code review pointing out any potential bugs, clean code violations, performance bottlenecks, and security flaws.`
        } else if (text.startsWith('/commit')) {
          const args = text.slice(7).trim()
          lastMessage.content = `First, run the terminal_exec tool with command "git diff --staged" and "git status" to inspect the current staged changes in the workspace.
If there are no staged changes, advise the user to stage files using git add or check git status.
If there are staged changes, generate a concise, conventional git commit message based on the diff.
Then, execute "git commit -m '<commit message>'" using terminal_exec to automatically create the commit.
${args ? `Use this description as the basis for the commit message: "${args}"` : ''}`
        } else if (text.startsWith('/vuln')) {
          lastMessage.content = `Scan the codebase for potential security vulnerabilities. Search files for sensitive keys, hardcoded credentials, eval statements, or unsafe terminal command executions.`
        } else if (text.startsWith('/bug')) {
          const args = text.slice(4).trim()
          lastMessage.content = `Inspect the codebase to identify potential bugs. ${args ? `Focus on: "${args}".` : 'Analyze the active files and directory structure to find logic issues or runtime errors.'}`
        } else if (text.startsWith('/test')) {
          const args = text.slice(5).trim()
          lastMessage.content = `Check the workspace files to see what testing frameworks are used. Generate and run tests using terminal_exec. ${args ? `Additional context: "${args}"` : ''}`
        } else if (text.startsWith('/explain')) {
          const args = text.slice(8).trim()
          lastMessage.content = `Thoroughly explain the selected code or concept. ${args ? `Explain: "${args}"` : 'Analyze the active workspace files and explain how the project is structured.'}`
        } else if (text.startsWith('/search')) {
          const args = text.slice(7).trim()
          lastMessage.content = `Search the workspace for "${args}" using file_search. Analyze and report the results.`
        }
      }
    }

    // Build skills context
    const skillsContext = enabledSkills?.length
      ? `\n\nYou have access to the following tools/skills that you can invoke by responding with special JSON blocks:\n\n${enabledSkills
          .map((s) => `- ${s.replace(/-/g, '_')}`)
          .join('\n')}\n\nTo use a tool, respond with a JSON block in this format:\n\`\`\`tool\n{"tool": "tool-name", "input": {"key": "value"}}\n\`\`\`\n\nAvailable tools:\n- \`file_read\`: Read a file. Input: {"path": "/path/to/file"}\n- \`file_write\`: Write/create a file. Input: {"path": "/path/to/file", "content": "file content"}\n- \`file_list\`: List directory contents. Input: {"path": "/path/to/dir"}\n- \`file_delete\`: Delete a file. Input: {"path": "/path/to/file"}\n- \`file_search\`: Search files by name/content. Input: {"query": "search term", "path": "/search/dir"}\n- \`terminal_exec\`: Execute a terminal command. Input: {"command": "shell command", "cwd": "/working/dir"}. Note: changing directories via "cd" does not persist across separate calls. Chain commands with "&&" (e.g. "cd dir && command") or pass the "cwd" parameter.\n- \`web_search\`: Search the web. Input: {"query": "search query"}\n- \`web_scrape\`: Scrape a web page. Input: {"url": "https://example.com"}\n- \`system_info\`: Get system information. Input: {}\n- \`ask_question\`: Ask the user a clarifying question or request feedback. Input: {"question": "Question text to present", "options": ["Option A", "Option B"]} (options array is optional; omit for write-in open responses).\n- \`start_subagent\`: Spawn a specialized subagent in the background to execute a task. Input: {"name": "subagent_name", "prompt": "specific prompt/instructions for the subagent"}.\n\nWhen you need to use a tool, output ONLY the JSON block and STOP generating further text immediately. Do not write anything after the tool block. The user's system will automatically execute the tool, display the result to you in the next message, and trigger your next response. You can then write your explanation or call another tool based on the real tool output.\n\nIMPORTANT: For file operations and terminal commands, always confirm with the user before executing destructive operations (delete, overwrite).`
      : ''

    const systemPrompt = systemPromptOverride || `You are NaviCode, an elite, autonomous AI coding agent mirroring the capabilities, rigor, and behaviors of Claude Code. You operate in a stateful multi-turn tool-use loop to research, edit, test, and verify code directly on the user's workspace.

### Core Mission & Capabilities
1. **Autonomous Execution**: You do not just describe changes; you perform them using the available filesystem and terminal tools. You break down complex requests into incremental steps and verify each step.
2. **Meticulous Codebase Research**: Before editing, you search for symbol definitions, imports, and file structures. You never guess. You read files completely to understand context.
3. **Continuous Verification Loop (TDD)**:
   - When writing code or fixing bugs, you identify or write corresponding tests first.
   - You execute compilation, linting, or test commands using \`terminal_exec\` to observe failures.
   - You apply code edits, then run tests/compilation again. If errors are encountered, you read the compiler/test logs, fix the code, and re-run verification until all checks pass.
4. **Filesystem Integrity**: You read, write, search, and delete files on the local filesystem. You preserve existing comment blocks, documentation, styling, and imports unless explicitly told to change them.
5. **Stateful Shell Operations**: You run shell commands. Remember that shell environments do not persist directories across separate \`terminal_exec\` calls; you chain commands using \`&&\` (e.g., \`cd path && command\`) or use the \`cwd\` parameter.
6. **Linguistic & Workspace Adaptability**: In Indonesian, terms like "direktori utama", "folder utama", or "root" can refer to the project workspace root, the user's home directory (~), or the OS root (/). When tasked to find or inspect files in these directories, systematically check all three locations to ensure you find the correct path.

### Guidelines for Tool Use & Formatting
- **STOP Protocol**: To run a tool, you output ONLY the JSON block inside the \`\`\`tool\`\`\` markdown block and STOP generating text immediately. Do not write text before or after the tool block. Wait for the system to execute the tool and feed the result into your context in the next turn.
- **Code Block Formatting**: Always use standard markdown code blocks with the language tag. Include a filename comment at the top (e.g., \`// filepath: src/app/page.tsx\`).
- **Production-Quality Code**: Write clean, modern, type-safe, and robust code with comprehensive error handling. Never use mock placeholders or ellipses (\`// ...\`) in modified files; always return the complete updated content.
- **No Hallucinated Results**: Never invent or hallucinate tool outputs. Always call the tool and let the client execute it.

${skillsContext}
You are running inside a modern IDE-like web interface called NaviCode. The user can see their project files, active terminal, and editor directly. Your terminal runs in ${process.platform === 'win32' ? 'cmd.exe' : 'zsh'}.`

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
  const normalizedMessages = messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  // Prepend system prompt to the first user message as a fallback/reinforcement
  if (normalizedMessages.length > 0 && normalizedMessages[0].role === 'user') {
    normalizedMessages[0] = {
      ...normalizedMessages[0],
      content: `[System Instruction: ${systemPrompt}]\n\n${normalizedMessages[0].content}`
    }
  }

  return [
    { role: 'system' as const, content: systemPrompt },
    ...normalizedMessages
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
    messages: messages.map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
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
interface ProviderInfo {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  type: 'builtin' | 'custom'
  headers?: Record<string, string>
  apiFormat?: ApiFormat
}

async function handleOpenAIProvider(
  provider: ProviderInfo,
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
    headers['HTTP-Referer'] = 'https://navicode.dev'
    headers['X-Title'] = 'NaviCode AI Assistant'
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
  provider: ProviderInfo,
  model: string,
  systemPrompt: string,
  messages: ChatMessageInput[]
) {
  const baseUrl = (provider.baseUrl || '').replace(/\/$/, '')
  const fcc = isFccProxy(provider.name, baseUrl)
  const apiKey = fcc && !provider.apiKey ? 'freecc' : provider.apiKey

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    ...provider.headers,
  }

  // For FCC proxy and other Anthropic proxies, also set Bearer auth
  // since some proxies accept both formats. FCC proxy prefers x-api-key.
  if (!headers['Authorization']) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  // Convert messages to Anthropic format
  // Anthropic uses: system (separate), user, assistant
  const anthropicMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

  // Prepend system prompt to the first user message as a fallback/reinforcement
  // to ensure proxies/providers that strip or ignore the system prompt field still receive it.
  if (anthropicMessages.length > 0 && anthropicMessages[0].role === 'user') {
    anthropicMessages[0] = {
      ...anthropicMessages[0],
      content: `[System Instruction: ${systemPrompt}]\n\n${anthropicMessages[0].content}`
    }
  }

  // Determine the model to send
  // FCC proxy expects the full slug with provider prefix (e.g., "nvidia_nim/model")
  // Other Anthropic-compatible providers use the model name directly
  const modelToUse = model

  // Determine max tokens based on provider and model
  // - FCC proxy routes to various models, some of which support very long outputs
  // - Direct Anthropic Claude models: 8192 default, up to 32768 for extended
  // - Other providers: 4096 conservative default
  let maxTokens: number
  if (fcc) {
    // FCC proxy: use higher limit since it routes to various models
    // that may support longer outputs
    maxTokens = 16384
  } else if (modelToUse.includes('claude')) {
    // Direct Anthropic Claude models
    maxTokens = 8192
  } else {
    // Other Anthropic-compatible providers
    maxTokens = 4096
  }

  // Build request body
  const body: Record<string, unknown> = {
    model: modelToUse,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: anthropicMessages,
    stream: true,
  }

  // Support thinking/extended thinking for Claude models via FCC or direct Anthropic
  // This enables Claude's reasoning mode when the model supports it
  if (modelToUse.includes('claude') && (fcc || baseUrl.includes('anthropic.com'))) {
    body.thinking = {
      type: 'enabled',
      budget_tokens: Math.min(maxTokens, 10000),
    }
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  } catch (fetchError) {
    // Handle connection errors (proxy not running, network issues, etc.)
    const errMsg = fetchError instanceof Error ? fetchError.message : 'Unknown connection error'
    if (fcc) {
      return NextResponse.json(
        {
          error: `Cannot connect to FCC proxy at ${baseUrl}. Make sure fcc-server is running. Install it with: curl -fsSL "https://github.com/Alishahryar1/free-claude-code/blob/main/scripts/install.sh?raw=1" | sh — then run: fcc-server`,
        },
        { status: 502 }
      )
    }
    return NextResponse.json(
      { error: `Connection error: ${errMsg}. Check that the provider is accessible at ${baseUrl}.` },
      { status: 502 }
    )
  }

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage = `Anthropic API error (${response.status}): ${errorText}`

    // Provide more helpful error messages for common FCC proxy issues
    if (fcc) {
      if (response.status === 401 || response.status === 403) {
        errorMessage = `Authentication failed for FCC proxy. Check that your auth token is correct (default: "freecc"). Set it via ANTHROPIC_AUTH_TOKEN env var when starting fcc-server.`
      } else if (response.status === 404) {
        errorMessage = `FCC proxy returned 404. The model "${modelToUse}" may not be available. Check available models at http://localhost:8082/admin or try fetching models in Settings.`
      } else if (response.status === 500 || response.status === 502 || response.status === 503) {
        errorMessage = `FCC proxy server error (${response.status}). The upstream provider may be unavailable, or the API key for that provider may not be set. Open the admin UI at http://localhost:8082/admin to configure provider API keys.`
      } else if (response.status === 429) {
        errorMessage = `Rate limited by FCC proxy or upstream provider. Wait a moment and try again.`
      }
    } else {
      if (response.status === 401 || response.status === 403) {
        errorMessage = `Authentication failed. Check your API key for the ${provider.name || 'provider'}.`
      } else if (response.status === 404) {
        errorMessage = `Model "${modelToUse}" not found. Check that the model is available on this provider.`
      }
    }

    return NextResponse.json(
      { error: errorMessage },
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
        let isInThinkingBlock = false

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
                  // If we were in a thinking block, close it before outputting text
                  if (isInThinkingBlock) {
                    controller.enqueue(encoder.encode('\n</thinking>\n\n'))
                    isInThinkingBlock = false
                  }
                  controller.enqueue(encoder.encode(text))
                }
                // Handle thinking delta within content blocks
                const thinking = json.delta?.thinking
                if (thinking) {
                  if (!isInThinkingBlock) {
                    controller.enqueue(encoder.encode('<thinking>\n'))
                    isInThinkingBlock = true
                  }
                  controller.enqueue(encoder.encode(thinking))
                }
              }
              // Handle thinking blocks (for Claude extended thinking)
              else if (json.type === 'thinking_delta') {
                const thinking = json.delta?.thinking
                if (thinking) {
                  if (!isInThinkingBlock) {
                    controller.enqueue(encoder.encode('<thinking>\n'))
                    isInThinkingBlock = true
                  }
                  controller.enqueue(encoder.encode(thinking))
                }
              }
              // Handle content block start (may indicate thinking block)
              else if (json.type === 'content_block_start') {
                if (json.content_block?.type === 'thinking') {
                  if (!isInThinkingBlock) {
                    controller.enqueue(encoder.encode('<thinking>\n'))
                    isInThinkingBlock = true
                  }
                } else if (json.content_block?.type === 'text' && isInThinkingBlock) {
                  controller.enqueue(encoder.encode('\n</thinking>\n\n'))
                  isInThinkingBlock = false
                }
              }
              // Handle message_stop (end of stream)
              else if (json.type === 'message_stop') {
                // Close any open thinking block
                if (isInThinkingBlock) {
                  controller.enqueue(encoder.encode('\n</thinking>'))
                  isInThinkingBlock = false
                }
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
        // Ensure thinking block is closed at end of stream
        if (isInThinkingBlock) {
          try { controller.enqueue(encoder.encode('\n</thinking>')) } catch {}
        }
        try { controller.close() } catch {}
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
