import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { executeTool } from '@/lib/tool-executor'

export const dynamic = 'force-dynamic'

interface ChatMessageInput {
  role: string
  content: string
}

type ApiFormat = 'openai' | 'anthropic' | 'builtin'

interface ProviderInfo {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  type: 'builtin' | 'custom'
  headers?: Record<string, string>
  apiFormat?: ApiFormat
}

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

function detectApiFormat(name: string, baseUrl: string): ApiFormat {
  const nameLower = name.toLowerCase()
  const urlLower = baseUrl.toLowerCase()

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
// Tool extraction from AI response text
// ──────────────────────────────────────────

interface ToolCall {
  tool: string
  input: Record<string, unknown>
}

function extractToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = []
  const regex = /```(?:tool|json)?\s*\n({[\s\S]*?})\n```/g
  let match
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      if (parsed && typeof parsed === 'object' && 'tool' in parsed && 'input' in parsed) {
        calls.push({ tool: parsed.tool, input: parsed.input as Record<string, unknown> })
      }
    } catch {
      // Not valid JSON — skip
    }
  }
  return calls
}

// ──────────────────────────────────────────
// Stream a plain text string as a Response
// ──────────────────────────────────────────

function streamTextResponse(text: string): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
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
// Server-side tool loop
// Makes streaming AI calls, collects text,
// checks for tool blocks, executes tools,
// repeats until no more tools, then streams
// the final text.
// ──────────────────────────────────────────

const TOOLS_THAT_NEED_USER = new Set(['ask_question', 'start_subagent'])
const MAX_TOOL_DEPTH = 10

async function runToolLoop(
  callAI: (msgs: { role: string; content: string }[]) => Promise<string>,
  initialMessages: { role: string; content: string }[],
): Promise<Response> {
  const messages = [...initialMessages]

  for (let depth = 0; depth < MAX_TOOL_DEPTH; depth++) {
    const text = await callAI(messages)
    const toolCalls = extractToolCalls(text)

    // No tools → this is the final response
    if (toolCalls.length === 0) {
      return streamTextResponse(text)
    }

    // Execute each tool and append results
    for (const call of toolCalls) {
      // Tools that need frontend interaction: let the AI handle them in natural language
      if (TOOLS_THAT_NEED_USER.has(call.tool)) {
        // Strip the tool block from the text and stream as-is
        const cleaned = text.replace(/```(?:tool|json)?\s*\n\{[\s\S]*?\}\n```/g, '').trim()
        return streamTextResponse(cleaned || `I need to ask you something: ${JSON.stringify(call.input)}`)
      }

      let result: string
      try {
        result = await executeTool(call.tool, call.input)
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
      }

      // Append assistant's response and tool result for the next AI turn
      messages.push(
        { role: 'assistant', content: text },
        { role: 'user', content: `[Tool result for "${call.tool}"]:\n${result}\n\nContinue your response based on the tool result above.` },
      )
    }
  }

  return streamTextResponse('Tool execution loop reached maximum depth. Please try again with a simpler request.')
}

// ──────────────────────────────────────────
// POST handler
// ──────────────────────────────────────────

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
      provider?: ProviderInfo
      enabledSkills?: string[]
      systemPromptOverride?: string
    } = await request.json()

    console.log(`[Chat API] model="${model}" provider="${provider?.name || 'builtin'}" skills=${enabledSkills?.length || 0}`)

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

    // Build skills context — exclude tools that need frontend interaction
    const serverSkills = (enabledSkills || []).filter((s) => !TOOLS_THAT_NEED_USER.has(s))
    const skillsContext = serverSkills.length
      ? `\n\nYou have access to the following tools that you can invoke by responding with a JSON block:\n\n${serverSkills
          .map((s) => `- ${s.replace(/-/g, '_')}`)
          .join('\n')}\n\nTo use a tool, respond with a JSON block in this format:\n\`\`\`tool\n{"tool": "tool-name", "input": {"key": "value"}}\n\`\`\`\n\nAvailable tools:\n- \`file_read\`: Read a file. Input: {"path": "/path/to/file"}\n- \`file_write\`: Write/create a file. Input: {"path": "/path/to/file", "content": "file content"}\n- \`file_list\`: List directory contents. Input: {"path": "/path/to/dir"}\n- \`file_delete\`: Delete a file. Input: {"path": "/path/to/file"}\n- \`file_search\`: Search files by name/content. Input: {"query": "search term", "path": "/search/dir"}\n- \`terminal_exec\`: Execute a terminal command. Input: {"command": "shell command", "cwd": "/working/dir"}. Note: changing directories via "cd" does not persist across separate calls. Chain commands with "&&" (e.g. "cd dir && command") or pass the "cwd" parameter.\n- \`web_search\`: Search the web. Input: {"query": "search query"}\n- \`web_scrape\`: Scrape a web page. Input: {"url": "https://example.com"}\n- \`system_info\`: Get system information. Input: {}\n- \`file_download\`: Download a file from a URL. Input: {"url": "https://example.com/file", "path": "local/path/to/save"}\n- \`http_client\`: Send HTTP requests (GET, POST, etc.) to endpoints. Input: {"url": "https://api.example.com", "method": "GET", "headers": {"Content-Type": "application/json"}, "body": {}}\n- \`db_query\`: Execute queries on a SQLite database. Input: {"query": "SELECT * FROM User LIMIT 5", "db_path": "db/custom.db"}.\n\nWhen you need to use a tool, output the JSON block inside \`\`\`tool\`\`\` fences. The system will automatically execute the tool and deliver the result to you in the next turn, so you can continue your response normally. You may output text before or after the tool block.\n\nIMPORTANT: For destructive operations (delete, overwrite, rm commands, etc.), first ask the user for permission in natural language and wait for their confirmation before executing.`
      : ''

    const systemPrompt = systemPromptOverride
      ? `${systemPromptOverride}\n${skillsContext}`
      : `You are NaviCode, an elite, autonomous AI coding agent mirroring the capabilities, rigor, and behaviors of Claude Code. You operate in a stateful multi-turn tool-use loop to research, edit, test, and verify code directly on the user's workspace.

### Core Mission & Capabilities
1. **Autonomous Execution**: You do not just describe changes; you perform them using the available filesystem and terminal tools. You break down complex requests into incremental steps and verify each step.
2. **Meticulous Codebase Research**: Before editing, you search for symbol definitions, imports, and file structures. You never guess. You read files completely to understand context.
3. **Continuous Verification Loop (TDD)**:
   - When writing code or fixing bugs, you identify or write corresponding tests first.
   - You execute compilation, linting, or test commands using \`terminal_exec\` to observe failures.
   - You apply code edits, then run tests/compilation again. If errors are encountered, you read the compiler/test logs, fix the code, and re-run verification until all checks pass.
4. **Filesystem Integrity**: You read, write, search, and delete files on the local filesystem. You preserve existing comment blocks, documentation, styling, and imports unless explicitly told to change them.
5. **Stateful Shell Operations**: You run shell commands. Remember that shell environments do not persist directories across separate \`terminal_exec\` calls; you chain commands using \`&&\` (e.g., \`cd path && command\`) or use the \`cwd\` parameter.
6. **No Guessing File Paths**: Never invent or hallucinate file directory listings, file contents, or user home paths. If you don't have the real filesystem data, use the available tools to get it. If tools are not available, state that you cannot inspect the filesystem rather than making up paths or directory structures.

### Code Formatting
- Use standard markdown code blocks with the language tag. Include a filename comment at the top (e.g., \`// filepath: src/app/page.tsx\`).
- Write clean, modern, type-safe code with comprehensive error handling. Never use mock placeholders or ellipses (\`// ...\`) in modified files; always return the complete updated content.

${skillsContext}
You are running inside a modern IDE-like web interface called NaviCode. The user can see their project files, active terminal, and editor directly. Your terminal runs in ${process.platform === 'win32' ? 'cmd.exe' : 'zsh'}.`

    const apiFormat: ApiFormat = provider?.apiFormat || detectApiFormat(provider?.name || '', provider?.baseUrl || '')

    // Built-in provider (no tool loop)
    if (!provider || provider.type === 'builtin' || !provider.baseUrl || !provider.apiKey) {
      return handleBuiltinProvider(allMessages(systemPrompt, messages), model)
    }

    // Anthropic provider (with optional tool loop)
    if (apiFormat === 'anthropic') {
      return handleAnthropicProvider(provider, model, systemPrompt, messages, serverSkills)
    }

    // OpenAI provider (with optional tool loop)
    return handleOpenAIProvider(provider, model, systemPrompt, messages, serverSkills)
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

async function handleOpenAIProvider(
  provider: ProviderInfo,
  model: string,
  systemPrompt: string,
  messages: ChatMessageInput[],
  enabledSkills: string[],
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

  // Prepare messages with system prompt
  const openaiMessages = allMessages(systemPrompt, messages)

  // No skills → simple streaming (keep old behavior)
  if (enabledSkills.length === 0) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages: openaiMessages, stream: true }),
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

  // Skills enabled → run tool loop
  return runToolLoop(
    async (msgs) => {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, messages: msgs, stream: true }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Provider API error (${response.status}): ${errorText}`)
      }

      return collectOpenAIText(response)
    },
    openaiMessages,
  )
}

async function collectOpenAIText(response: Response): Promise<string> {
  const decoder = new TextDecoder()
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No reader available')

  let buffer = ''
  let fullText = ''

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
          fullText += content
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }

  return fullText
}

function proxyOpenAIStream(response: Response): Response {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const reader = response.body?.getReader()
        if (!reader) { controller.error(new Error('No reader available')); return }

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
            } catch { /* skip */ }
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
// ──────────────────────────────────────────

async function handleAnthropicProvider(
  provider: ProviderInfo,
  model: string,
  systemPrompt: string,
  messages: ChatMessageInput[],
  enabledSkills: string[],
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

  if (!headers['Authorization']) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  // Build anthropic messages (filter system role, inject system prompt into first user message)
  const anthropicMessages = buildAnthropicMessages(messages, systemPrompt)

  const modelToUse = model

  let maxTokens: number
  if (fcc) maxTokens = 16384
  else if (modelToUse.includes('claude')) maxTokens = 8192
  else maxTokens = 4096

  const body: Record<string, unknown> = {
    model: modelToUse,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: anthropicMessages,
    stream: true,
  }

  if (modelToUse.includes('claude') && (fcc || baseUrl.includes('anthropic.com'))) {
    body.thinking = { type: 'enabled', budget_tokens: Math.min(maxTokens, 10000) }
  }

  // No skills → simple streaming (keep old behavior)
  if (enabledSkills.length === 0) {
    const response = await makeAnthropicRequest(baseUrl, headers, body, fcc)
    if (!response.ok) return handleAnthropicError(response, fcc, provider, modelToUse)
    return proxyAnthropicStream(response)
  }

  // Skills enabled → run tool loop
  return runToolLoop(
    async (msgs) => {
      const loopBody = {
        ...body,
        messages: msgs,
        system: systemPrompt,
      }
      const response = await makeAnthropicRequest(baseUrl, headers, loopBody, fcc)
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Anthropic API error (${response.status}): ${errorText}`)
      }
      return collectAnthropicText(response)
    },
    anthropicMessages,
  )
}

function buildAnthropicMessages(messages: ChatMessageInput[], systemPrompt: string) {
  const msgs = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  if (msgs.length > 0 && msgs[0].role === 'user') {
    msgs[0] = {
      ...msgs[0],
      content: `[System Instruction: ${systemPrompt}]\n\n${msgs[0].content}`
    }
  }

  return msgs
}

async function makeAnthropicRequest(baseUrl: string, headers: Record<string, string>, body: Record<string, unknown>, fcc: boolean): Promise<Response> {
  try {
    return await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  } catch (fetchError) {
    const errMsg = fetchError instanceof Error ? fetchError.message : 'Unknown connection error'
    if (fcc) {
      throw new Error(`Cannot connect to FCC proxy at ${baseUrl}. Make sure fcc-server is running. Install it with: curl -fsSL "https://github.com/Alishahryar1/free-claude-code/blob/main/scripts/install.sh?raw=1" | sh — then run: fcc-server`)
    }
    throw new Error(`Connection error: ${errMsg}. Check that the provider is accessible at ${baseUrl}.`)
  }
}

async function handleAnthropicError(response: Response, fcc: boolean, provider: ProviderInfo, modelToUse: string): Promise<Response> {
  const errorText = await response.text()
  let errorMessage = `Anthropic API error (${response.status}): ${errorText}`

  if (fcc) {
    if (response.status === 401 || response.status === 403) {
      errorMessage = `Authentication failed for FCC proxy. Check that your auth token is correct (default: "freecc").`
    } else if (response.status === 404) {
      errorMessage = `FCC proxy returned 404. The model "${modelToUse}" may not be available.`
    } else if (response.status === 500 || response.status === 502 || response.status === 503) {
      errorMessage = `FCC proxy server error (${response.status}). The upstream provider may be unavailable.`
    } else if (response.status === 429) {
      errorMessage = `Rate limited by FCC proxy or upstream provider. Wait a moment and try again.`
    }
  } else {
    if (response.status === 401 || response.status === 403) {
      errorMessage = `Authentication failed. Check your API key for the ${provider.name || 'provider'}.`
    } else if (response.status === 404) {
      errorMessage = `Model "${modelToUse}" not found on ${provider.name || 'provider'}.`
    }
  }

  return NextResponse.json({ error: errorMessage }, { status: response.status })
}

async function collectAnthropicText(response: Response): Promise<string> {
  const decoder = new TextDecoder()
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No reader available')

  let buffer = ''
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue

      try {
        const json = JSON.parse(trimmed.slice(6))
        if (json.type === 'content_block_delta') {
          const text = json.delta?.text
          if (text) fullText += text
        } else if (json.type === 'error') {
          // propagate error text into the result so the AI sees it
          fullText += `\n[API Error: ${json.error?.message || JSON.stringify(json.error)}]`
        }
      } catch { /* skip */ }
    }
  }

  return fullText
}

function proxyAnthropicStream(response: Response): Response {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const reader = response.body?.getReader()
        if (!reader) { controller.error(new Error('No reader available')); return }

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

            try {
              const json = JSON.parse(trimmed.slice(6))

              if (json.type === 'content_block_delta') {
                const text = json.delta?.text
                if (text) {
                  if (isInThinkingBlock) {
                    controller.enqueue(encoder.encode('\n</thinking>\n\n'))
                    isInThinkingBlock = false
                  }
                  controller.enqueue(encoder.encode(text))
                }
                const thinking = json.delta?.thinking
                if (thinking) {
                  if (!isInThinkingBlock) {
                    controller.enqueue(encoder.encode('<thinking>\n'))
                    isInThinkingBlock = true
                  }
                  controller.enqueue(encoder.encode(thinking))
                }
              } else if (json.type === 'thinking_delta') {
                const thinking = json.delta?.thinking
                if (thinking) {
                  if (!isInThinkingBlock) {
                    controller.enqueue(encoder.encode('<thinking>\n'))
                    isInThinkingBlock = true
                  }
                  controller.enqueue(encoder.encode(thinking))
                }
              } else if (json.type === 'content_block_start') {
                if (json.content_block?.type === 'thinking') {
                  if (!isInThinkingBlock) {
                    controller.enqueue(encoder.encode('<thinking>\n'))
                    isInThinkingBlock = true
                  }
                } else if (json.content_block?.type === 'text' && isInThinkingBlock) {
                  controller.enqueue(encoder.encode('\n</thinking>\n\n'))
                  isInThinkingBlock = false
                }
              } else if (json.type === 'message_stop') {
                if (isInThinkingBlock) {
                  controller.enqueue(encoder.encode('\n</thinking>'))
                  isInThinkingBlock = false
                }
              } else if (json.type === 'error') {
                controller.enqueue(encoder.encode(`\n[Error: ${json.error?.message || JSON.stringify(json.error)}]`))
              }
            } catch { /* skip */ }
          }
        }
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
