import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile, unlink, readdir, stat, mkdir } from 'fs/promises'
import { join, resolve, dirname } from 'path'
import { useEditorStore } from '@/stores/editor-store'
import ZAI from 'z-ai-web-dev-sdk'

const execAsync = promisify(exec)
const PROJECT_ROOT = process.env.NAVICODE_ROOT || process.env.ZCODE_ROOT || process.cwd()

function safePath(inputPath: string): string {
  if (!inputPath || inputPath === '.') return PROJECT_ROOT
  if (inputPath.startsWith('/')) return resolve(inputPath)
  return resolve(join(PROJECT_ROOT, inputPath))
}

// Determine base directory for relative operations, falling back to editor cwd
function getBaseDir(input: any): string {
  if (input?.cwd) return safePath(input.cwd)
  // editor store may not be initialized in serverless context; fallback to PROJECT_ROOT
  const storeCwd = (useEditorStore.getState() as any).getCwd?.()
  return storeCwd ? safePath(storeCwd) : PROJECT_ROOT
}

function resolvePath(p: string | undefined, base: string): string {
  if (!p) return base
  if (p.startsWith('/')) return safePath(p)
  return resolve(base, p)
}

export async function POST(request: NextRequest) {
  try {
    const { tool, input } = await request.json()
    const normalizedTool = typeof tool === 'string' ? tool.replace(/-/g, '_') : tool

    switch (normalizedTool) {
      case 'file_read': {
        if (!input) {
          return NextResponse.json({ success: false, error: 'Missing input object.' })
        }
        const base = getBaseDir(input)
        const filePath = resolvePath(input.path, base)
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
        if (!input || typeof input.path !== 'string' || typeof input.content !== 'string') {
          return NextResponse.json({ success: false, error: 'Missing or invalid "path" or "content" parameters (both must be strings).' })
        }
        const base = getBaseDir(input)
        const filePath = resolvePath(input.path, base)
        await mkdir(dirname(filePath), { recursive: true })
        await writeFile(filePath, input.content, 'utf-8')
        return NextResponse.json({
          tool: 'file_write',
          success: true,
          output: `File written: ${input.path}`,
        })
      }

      case 'file_list': {
        const base = getBaseDir(input)
        const dirPath = resolvePath(input?.path, base)
        const entries = await readdir(dirPath, { withFileTypes: true })
        const items = entries
          .filter((e) => !e.name.startsWith('.'))
          .map((entry) => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            path: join(dirPath, entry.name),
          }))
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
            return a.name.localeCompare(b.name)
          })
        const formatted = items.map((i) => `${i.type === 'directory' ? '📁' : '📄'} ${i.name}`).join('\n')
        return NextResponse.json({
          tool: 'file_list',
          success: true,
          output: `Contents of ${dirPath}:\n\n${formatted}`,
          items,
        })
      }

      case 'file_delete': {
        if (!input || typeof input.path !== 'string') {
          return NextResponse.json({ success: false, error: 'Missing or invalid "path" parameter (must be a string).' })
        }
        const base = getBaseDir(input)
        const filePath = resolvePath(input.path, base)
        await unlink(filePath)
        return NextResponse.json({
          tool: 'file_delete',
          success: true,
          output: `File deleted: ${input.path}`,
        })
      }

      case 'file_search': {
        if (!input || typeof input.query !== 'string') {
          return NextResponse.json({ success: false, error: 'Missing or invalid "query" parameter (must be a string).' })
        }
        const base = getBaseDir(input)
        const searchDir = resolvePath(input.path, base)
        const query = (input.query || '').replace(/"/g, '\\"')
        try {
          // Try grep first (available on all Mac)
          const { stdout } = await execAsync(
            `grep -r "${query}" "${searchDir}" -l --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --include="*.md" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next 2>/dev/null | head -20`,
            { timeout: 15000 }
          )
          const fileMatches = stdout.trim()
          // Also search by filename or directory name
          const { stdout: nameOut } = await execAsync(
            `find "${searchDir}" -name "*${query}*" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.next/*" 2>/dev/null | head -20`,
            { timeout: 10000 }
          )
          const nameMatches = nameOut.trim()
          const allResults = [...new Set([...fileMatches.split('\n'), ...nameMatches.split('\n')].filter(Boolean))].join('\n')
          return NextResponse.json({
            tool: 'file_search',
            success: true,
            output: allResults ? `Search results for "${input.query}":\n${allResults}` : `No files found matching "${input.query}"`,
          })
        } catch {
          return NextResponse.json({
            tool: 'file_search',
            success: false,
            output: '',
            error: 'Search failed',
          })
        }
      }

      case 'terminal_exec': {
        if (!input || typeof input.command !== 'string') {
          return NextResponse.json({ success: false, error: 'Missing or invalid "command" parameter (must be a string).' })
        }
        const cwd = input.cwd ? safePath(input.cwd) : PROJECT_ROOT
        // Safety check
        const blocked = ['rm -rf /', 'mkfs', ':(){:|:&};:', 'shutdown', 'reboot']
        if (blocked.some((b) => (input.command || '').toLowerCase().includes(b))) {
          return NextResponse.json({ tool: 'terminal_exec', success: false, output: '', error: 'Command blocked for safety' })
        }
        try {
          const { stdout, stderr } = await execAsync(input.command, {
            cwd,
            timeout: 60000,
            maxBuffer: 1024 * 1024 * 10,
            env: { ...process.env, FORCE_COLOR: '0', TERM: 'dumb' },
            shell: '/bin/zsh',
          })
          return NextResponse.json({
            tool: 'terminal_exec',
            success: true,
            output: stdout.toString() || stderr.toString() || '(no output)',
            cwd,
          })
        } catch (execError: unknown) {
          const err = execError as { stdout?: string; stderr?: string; message?: string }
          return NextResponse.json({
            tool: 'terminal_exec',
            success: false,
            output: err.stdout?.toString() || '',
            error: err.stderr?.toString() || err.message || 'Command failed',
          })
        }
      }

      case 'web_search': {
        if (!input || typeof input.query !== 'string') {
          return NextResponse.json({ success: false, error: 'Missing or invalid "query" parameter (must be a string).' })
        }
        const query = encodeURIComponent(input.query || '')
        try {
          // Try ZAI first if available
          const zai = await ZAI.create()
          const results = await zai.functions.invoke('web_search', {
            query: input.query,
            num: input.num || 10,
          })
          return NextResponse.json({
            tool: 'web_search',
            success: true,
            output: typeof results === 'string' ? results : JSON.stringify(results, null, 2),
          })
        } catch {
          // Fallback to DuckDuckGo
          try {
            const ddgRes = await fetch(`https://api.duckduckgo.com/?q=${query}&format=json&no_html=1&skip_disambig=1`)
            const data = await ddgRes.json()
            let result = ''
            if (data.AbstractText) result += `**Summary**: ${data.AbstractText}\n**Source**: ${data.AbstractURL}\n`
            if (data.RelatedTopics?.length > 0) {
              result += '\n**Related**:\n'
              data.RelatedTopics.slice(0, 5).forEach((t: { Text?: string }) => { if (t.Text) result += `- ${t.Text}\n` })
            }
            return NextResponse.json({ tool: 'web_search', success: true, output: result || `Search: https://duckduckgo.com/?q=${query}` })
          } catch {
            return NextResponse.json({ tool: 'web_search', success: true, output: `Search at: https://duckduckgo.com/?q=${query}` })
          }
        }
      }

      case 'web_scrape': {
        if (!input || typeof input.url !== 'string') {
          return NextResponse.json({ success: false, error: 'Missing or invalid "url" parameter (must be a string).' })
        }
        try {
          const zai2 = await ZAI.create()
          const content = await zai2.functions.invoke('page_reader', { url: input.url })
          return NextResponse.json({ tool: 'web_scrape', success: true, output: typeof content === 'string' ? content : JSON.stringify(content, null, 2) })
        } catch {
          try {
            const res = await fetch(input.url, { headers: { 'User-Agent': 'Mozilla/5.0 NaviCode/1.0' } })
            const html = await res.text()
            const text = html.replace(/<script[^>]*>[\ \S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000)
            return NextResponse.json({ tool: 'web_scrape', success: true, output: text })
          } catch (e) {
            return NextResponse.json({ tool: 'web_scrape', success: false, output: '', error: `Failed: ${e}` })
          }
        }
      }

      case 'system_info': {
        const os = await import('os')
        const cpus = os.cpus()
        const totalMem = os.totalmem()
        const freeMem = os.freemem()
        const info = [
          `**System Information**`,
          `OS: ${os.platform()} ${os.arch()} (${os.release()})`,
          `Hostname: ${os.hostname()}`,
          `User: ${os.userInfo().username}`,
          `Home: ${os.homedir()}`,
          `Project Root: ${PROJECT_ROOT}`,
          ``,
          `**CPU**: ${cpus[0]?.model} (${cpus.length} cores @ ${cpus[0]?.speed}MHz)`,
          `**Memory**: ${((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(2)} GB used / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB total`,
          `**Node.js**: ${process.version}`,
          `**Uptime**: ${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`,
        ].join('\n')
        return NextResponse.json({ tool: 'system_info', success: true, output: info })
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
