import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, unlink, stat, readdir } from 'fs/promises'
import { join, resolve, dirname, basename } from 'path'
import { mkdir } from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = process.env.NAVICODE_ROOT || process.env.ZCODE_ROOT || process.cwd()

function safePath(inputPath: string): string {
  // If absolute path given, use it directly (but still sanitize)
  const base = inputPath.startsWith('/') ? inputPath : join(PROJECT_ROOT, inputPath)
  const resolved = resolve(base)
  return resolved
}

// Read file / list dir
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'list'
    const inputPath = searchParams.get('path') || '.'
    const showHidden = searchParams.get('hidden') === 'true'

    if (action === 'list') {
      const dirPath = inputPath === '.' ? PROJECT_ROOT : safePath(inputPath)
      const entries = await readdir(dirPath, { withFileTypes: true })
      const items = entries
        .filter((entry) => showHidden || !entry.name.startsWith('.'))
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          path: join(dirPath, entry.name),
          relativePath: join(inputPath === '.' ? '' : inputPath, entry.name),
        }))
        .sort((a, b) => {
          // Folders first, then files
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
      return NextResponse.json({ success: true, path: dirPath, items, root: PROJECT_ROOT })
    }

    if (action === 'read') {
      const filePath = safePath(inputPath)
      const fileContent = await readFile(filePath, 'utf-8')
      const fileStat = await stat(filePath)
      return NextResponse.json({
        success: true,
        path: filePath,
        name: basename(filePath),
        content: fileContent,
        size: fileStat.size,
        modified: fileStat.mtime.toISOString(),
      })
    }

    if (action === 'stat') {
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

    if (action === 'root') {
      return NextResponse.json({ success: true, root: PROJECT_ROOT })
    }

    if (action === 'check-path') {
      const pathToCheck = searchParams.get('path') || ''
      try {
        const resolved = resolve(pathToCheck)
        const s = await stat(resolved)
        return NextResponse.json({ success: true, exists: s.isDirectory(), path: resolved })
      } catch {
        return NextResponse.json({ success: true, exists: false, path: pathToCheck })
      }
    }

    if (action === 'browse-folder') {
      try {
        const { stdout } = await execAsync(
          `osascript -e 'tell application "Finder"' -e 'activate' -e 'POSIX path of (choose folder with prompt "Pilih folder kerja untuk NaviCode")' -e 'end tell'`,
          { timeout: 180000, encoding: 'utf-8' }
        )
        const path = stdout.trim()
        if (!path) {
          return NextResponse.json({ success: false, error: 'No folder selected' })
        }
        return NextResponse.json({ success: true, path })
      } catch {
        return NextResponse.json({ success: false, error: 'Dialog cancelled' })
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

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
        const dirPath = inputPath === '.' ? PROJECT_ROOT : safePath(inputPath)
        const entries = await readdir(dirPath, { withFileTypes: true })
        const items = entries
          .filter((entry) => !entry.name.startsWith('.'))
          .map((entry) => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            path: join(dirPath, entry.name),
          }))
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
            return a.name.localeCompare(b.name)
          })
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

      case 'mkdir': {
        const dirPath = safePath(inputPath)
        await mkdir(dirPath, { recursive: true })
        return NextResponse.json({ success: true, path: dirPath, message: 'Directory created' })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
