import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile, unlink, readdir, stat, mkdir } from 'fs/promises'
import { join, resolve, dirname } from 'path'
import ZAI from 'z-ai-web-dev-sdk'

const execAsync = promisify(exec)
const PROJECT_ROOT = '/home/z/my-project'

function safePath(inputPath: string): string {
  const resolved = resolve(PROJECT_ROOT, inputPath.startsWith('/') ? inputPath.slice(1) : inputPath)
  if (!resolved.startsWith(PROJECT_ROOT)) {
    throw new Error('Access denied: path outside project directory')
  }
  return resolved
}

export async function POST(request: NextRequest) {
  try {
    const { tool, input } = await request.json()

    switch (tool) {
      case 'file_read': {
        const filePath = safePath(input.path)
        const content = await readFile(filePath, 'utf-8')
        const fileStat = await stat(filePath)
        return NextResponse.json({
          tool: 'file_read',
          success: true,
          output: content,
          meta: { size: fileStat.size, modified: fileStat.mtime.toISOString() },
        })
      }

      case 'file_write': {
        const filePath = safePath(input.path)
        await mkdir(dirname(filePath), { recursive: true })
        await writeFile(filePath, input.content, 'utf-8')
        return NextResponse.json({
          tool: 'file_write',
          success: true,
          output: `File written: ${input.path}`,
        })
      }

      case 'file_list': {
        const dirPath = safePath(input.path || '.')
        const entries = await readdir(dirPath, { withFileTypes: true })
        const items = entries.map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          path: join(input.path || '.', entry.name),
        }))
        return NextResponse.json({
          tool: 'file_list',
          success: true,
          output: JSON.stringify(items, null, 2),
        })
      }

      case 'file_delete': {
        const filePath = safePath(input.path)
        await unlink(filePath)
        return NextResponse.json({
          tool: 'file_delete',
          success: true,
          output: `File deleted: ${input.path}`,
        })
      }

      case 'file_search': {
        const searchDir = safePath(input.path || '.')
        const { stdout } = await execAsync(
          `rg --json -l "${input.query.replace(/"/g, '\\"')}" ${searchDir} 2>/dev/null || true`,
          { timeout: 15000 }
        )
        const results = stdout
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => {
            try { return JSON.parse(l) } catch { return null }
          })
          .filter(Boolean)
          .slice(0, 50)
        return NextResponse.json({
          tool: 'file_search',
          success: true,
          output: JSON.stringify(results, null, 2),
        })
      }

      case 'terminal_exec': {
        const { stdout, stderr } = await execAsync(input.command, {
          cwd: input.cwd || PROJECT_ROOT,
          timeout: 30000,
          maxBuffer: 1024 * 1024 * 10,
        })
        return NextResponse.json({
          tool: 'terminal_exec',
          success: true,
          output: stdout.toString(),
          error: stderr.toString() || undefined,
        })
      }

      case 'web_search': {
        const zai = await ZAI.create()
        const results = await zai.functions.invoke('web_search', {
          query: input.query,
          num: input.num || 10,
        })
        return NextResponse.json({
          tool: 'web_search',
          success: true,
          output: JSON.stringify(results, null, 2),
        })
      }

      case 'web_scrape': {
        const zai2 = await ZAI.create()
        const content = await zai2.functions.invoke('page_reader', {
          url: input.url,
        })
        return NextResponse.json({
          tool: 'web_scrape',
          success: true,
          output: JSON.stringify(content, null, 2),
        })
      }

      case 'system_info': {
        const os = await import('os')
        const cpus = os.cpus()
        const totalMem = os.totalmem()
        const freeMem = os.freemem()
        return NextResponse.json({
          tool: 'system_info',
          success: true,
          output: JSON.stringify({
            platform: os.platform(),
            arch: os.arch(),
            cpuCores: cpus.length,
            cpuModel: cpus[0]?.model,
            totalMemory: `${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
            freeMemory: `${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
            uptime: `${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`,
            hostname: os.hostname(),
          }, null, 2),
        })
      }

      default:
        return NextResponse.json({
          tool,
          success: false,
          error: `Unknown tool: ${tool}`,
        }, { status: 400 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      success: false,
      error: message,
    }, { status: 500 })
  }
}
