import { NextRequest, NextResponse } from 'next/server'

type ApiFormat = 'openai' | 'anthropic' | 'builtin'

interface ModelEntry {
  id: string
  name?: string
  owned_by?: string
  created?: number
}

interface ModelsResponse {
  models: ModelEntry[]
  raw?: unknown
}

export async function POST(request: NextRequest) {
  try {
    const {
      baseUrl,
      apiKey,
      apiFormat,
    }: {
      baseUrl: string
      apiKey: string
      apiFormat?: ApiFormat
    } = await request.json()

    if (!baseUrl) {
      return NextResponse.json({ error: 'baseUrl is required' }, { status: 400 })
    }

    const cleanBaseUrl = baseUrl.replace(/\/$/, '')
    const format: ApiFormat = apiFormat || 'openai'

    let modelsUrl: string
    let headers: Record<string, string>

    if (format === 'anthropic') {
      // Anthropic Messages API format: /v1/models
      modelsUrl = `${cleanBaseUrl}/v1/models`
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey || '',
        'anthropic-version': '2023-06-01',
      }
      // Also set Bearer auth for proxies that accept both
      if (apiKey && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${apiKey}`
      }
    } else {
      // OpenAI format: /models
      modelsUrl = `${cleanBaseUrl}/models`
      headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey || ''}`,
      }
    }

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      const errorText = await response.text()
      // Detect FCC proxy specifically
      const isFcc = cleanBaseUrl.includes(':8082') || cleanBaseUrl.includes('free-claude')
      let errorMessage = `Failed to fetch models (${response.status})`

      if (response.status === 401 || response.status === 403) {
        errorMessage = 'Authentication failed. Check your API key.'
      } else if (response.status === 404) {
        errorMessage = isFcc
          ? 'Models endpoint not found. Make sure fcc-server is running and up to date.'
          : 'Models endpoint not found. Check the base URL.'
      } else if (response.status >= 500) {
        errorMessage = isFcc
          ? 'Cannot connect to FCC proxy. Make sure fcc-server is running at ' + cleanBaseUrl
          : `Server error (${response.status}). The provider may be experiencing issues.`
      } else {
        errorMessage += `: ${errorText.slice(0, 200)}`
      }

      return NextResponse.json(
        { error: errorMessage, models: [] },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Normalize model list from different response formats
    let models: ModelEntry[] = []

    if (Array.isArray(data)) {
      // Some providers return an array directly
      models = data.map(normalizeModelEntry)
    } else if (data.data && Array.isArray(data.data)) {
      // OpenAI format: { data: [...] }
      models = data.data.map(normalizeModelEntry)
    } else if (data.models && Array.isArray(data.models)) {
      // Alternative format: { models: [...] }
      models = data.models.map(normalizeModelEntry)
    } else if (data.id || data.model) {
      // Single model response
      models = [normalizeModelEntry(data)]
    }

    // Sort models alphabetically by id
    models.sort((a, b) => a.id.localeCompare(b.id))

    const result: ModelsResponse = { models }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Models API error:', error)
    const isTimeout = error instanceof Error && error.name === 'TimeoutError'
    const baseUrl = (error as any)?.baseUrl || ''
    const isFcc = baseUrl.includes(':8082') || baseUrl.includes('free-claude')

    let errorMessage = 'Failed to fetch models'
    if (isTimeout) {
      errorMessage = isFcc
        ? 'Connection timed out. Make sure fcc-server is running at the configured URL.'
        : 'Connection timed out. The provider may be unreachable.'
    } else if (error instanceof TypeError && error.message.includes('fetch')) {
      errorMessage = isFcc
        ? 'Cannot connect to FCC proxy. Make sure fcc-server is running.'
        : 'Cannot connect to the provider. Check the base URL and your network.'
    } else {
      errorMessage = error instanceof Error ? error.message : 'Unknown error'
    }

    return NextResponse.json(
      { error: errorMessage, models: [] },
      { status: 502 }
    )
  }
}

function normalizeModelEntry(entry: unknown): ModelEntry {
  if (typeof entry === 'string') {
    return { id: entry }
  }
  if (typeof entry === 'object' && entry !== null) {
    const obj = entry as Record<string, unknown>
    // FCC proxy uses 'display_name', standard uses 'name'
    const name = obj.display_name || obj.name
    return {
      id: String(obj.id || obj.model || obj.name || ''),
      name: name ? String(name) : undefined,
      owned_by: obj.owned_by ? String(obj.owned_by) : undefined,
      created: typeof obj.created === 'number' ? obj.created : undefined,
    }
  }
  return { id: String(entry) }
}

// GET endpoint: quick connection health check
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const baseUrl = url.searchParams.get('baseUrl') || 'http://localhost:8082'
  const apiKey = url.searchParams.get('apiKey') || 'freecc'
  const cleanBaseUrl = baseUrl.replace(/\/$/, '')

  try {
    const res = await fetch(`${cleanBaseUrl}/v1/models`, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      return NextResponse.json({ connected: false, error: `HTTP ${res.status}`, models: 0 })
    }
    const data = await res.json()
    const count = (data.data || data.models || []).length
    return NextResponse.json({ connected: true, models: count, url: cleanBaseUrl })
  } catch (e) {
    return NextResponse.json({
      connected: false,
      error: e instanceof Error ? e.message : 'Connection failed',
      models: 0,
    })
  }
}
