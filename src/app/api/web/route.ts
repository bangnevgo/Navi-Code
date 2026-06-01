import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

export async function POST(request: NextRequest) {
  try {
    const { action, query, url, num = 10 } = await request.json()

    const zai = await ZAI.create()

    if (action === 'search' && query) {
      const searchResult = await zai.functions.invoke('web_search', {
        query,
        num,
      })

      return NextResponse.json({
        success: true,
        results: searchResult,
      })
    }

    if (action === 'scrape' && url) {
      const pageContent = await zai.functions.invoke('web_scrape', {
        url,
      })

      return NextResponse.json({
        success: true,
        content: pageContent,
      })
    }

    return NextResponse.json({ error: 'Invalid action. Use "search" or "scrape".' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
