import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

export async function POST(request: NextRequest) {
  try {
    const { messages, model } = await request.json()

    const zai = await ZAI.create()

    const systemPrompt = `You are ZCode, an expert AI coding assistant that combines the best features of Claude Code, OpenAI Codex, and OpenCode. You help developers with:

1. **Code Generation**: Write clean, efficient, well-documented code in any language
2. **Code Review**: Analyze code for bugs, performance issues, and best practices
3. **Debugging**: Help identify and fix errors in code
4. **Refactoring**: Suggest improvements to code structure and readability
5. **Architecture**: Help design scalable software architectures
6. **Explanation**: Explain complex code and concepts clearly

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

You are running inside a modern IDE-like web interface called ZCode. The user can see their project files and edit code directly.`

    const allMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    const completion = await zai.chat.completions.create({
      messages: allMessages,
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
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    )
  }
}
