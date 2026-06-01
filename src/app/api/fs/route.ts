import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, unlink, stat, readdir } from 'fs/promises'
import { join, resolve, dirname } from 'path'
import { mkdir } from 'fs/promises'

const PROJECT_ROOT = '/home/z/my-project'

function safePath(inputPath: string): string {
  const resolved = resolve(PROJECT_ROOT, inputPath.startsWith('/') ? inputPath.slice(1) : inputPath)
  if (!resolved.startsWith(PROJECT_ROOT)) {
    throw new Error('Access denied: path outside project directory')
  }
  return resolved
}

// Read file
export async function POST(request: NextRequest) {
  try {
    const { action, path: inputPath, content, encoding } = await request.json()

    switch (action) {
      case 'read': {
        const filePath = safePath(inputPath)
        const fileContent = await readFile(filePath, (encoding as BufferEncoding) || 'utf-8')
        const fileStat = await stat(filePath)
        return NextResponse.json({
          success: true,
          path: filePath,
          content: fileContent,
          size: fileStat.size,
          modified: fileStat.mtime.toISOString(),
        })
      }

      case 'write': {
        const filePath = safePath(inputPath)
        await mkdir(dirname(filePath), { recursive: true })
        await writeFile(filePath, content, 'utf-8')
        return NextResponse.json({ success: true, path: filePath, message: 'File written successfully' })
      }

      case 'delete': {
        const filePath = safePath(inputPath)
        await unlink(filePath)
        return NextResponse.json({ success: true, path: filePath, message: 'File deleted successfully' })
      }

      case 'list': {
        const dirPath = safePath(inputPath || '.')
        const entries = await readdir(dirPath, { withFileTypes: true })
        const items = entries.map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          path: join(inputPath || '.', entry.name),
        }))
        return NextResponse.json({ success: true, path: dirPath, items })
      }

      case 'stat': {
        const filePath = safePath(inputPath)
        const fileStat = await stat(filePath)
        return NextResponse.json({
          success: true,
          path: filePath,
          isDirectory: fileStat.isDirectory(),
          size: fileStat.size,
          modified: fileStat.mtime.toISOString(),
          created: fileStat.birthtime.toISOString(),
        })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
