import { NextResponse } from 'next/server'
import { useEditorStore } from '@/stores/editor-store'

export async function GET() {
  const cwd = useEditorStore.getState().getCwd?.() ?? (process.env.NAVICODE_ROOT || process.env.ZCODE_ROOT || process.cwd())
  return NextResponse.json({ cwd })
}
