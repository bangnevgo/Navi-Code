import { exec } from 'child_process'
import { promisify } from 'util'
import { readFile, writeFile, unlink, readdir, mkdir, stat } from 'fs/promises'
import { join, resolve, dirname } from 'path'
import { spawn } from 'child_process'

const execAsync = promisify(exec)
const PROJECT_ROOT = process.env.NAVICODE_ROOT || process.env.ZCODE_ROOT || process.cwd()

function safePath(inputPath: string): string {
  if (!inputPath || inputPath === '.') return PROJECT_ROOT
  if (inputPath.startsWith('/')) return resolve(inputPath)
  return resolve(join(PROJECT_ROOT, inputPath))
}

function resolvePath(p: string | undefined, base: string): string {
  if (!p) return base
  if (p.startsWith('/')) return safePath(p)
  return resolve(base, p)
}

function runSqliteQuery(dbPath: string, sql: string): Promise<string> {
  return new Promise((resolvePromise) => {
    const child = spawn('sqlite3', [dbPath, '-header', '-column'])
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
    child.on('close', () => {
      if (stderr) resolvePromise(`Error: ${stderr.trim()}`)
      else resolvePromise(stdout.trim() || '(no rows returned)')
    })
    child.stdin.write(sql)
    child.stdin.end()
  })
}

export async function executeTool(tool: string, input: Record<string, unknown>): Promise<string> {
  const normalizedTool = typeof tool === 'string' ? tool.replace(/-/g, '_') : tool

  switch (normalizedTool) {
    case 'file_read': {
      const p = input?.path as string | undefined
      if (!p) return 'Error: Missing "path" parameter'
      const filePath = resolvePath(p, PROJECT_ROOT)
      const content = await readFile(filePath, 'utf-8')
      return content
    }

    case 'file_write': {
      const p = input?.path as string | undefined
      const c = input?.content as string | undefined
      if (!p || typeof c !== 'string') return 'Error: Missing or invalid "path" or "content"'
      const filePath = resolvePath(p, PROJECT_ROOT)
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, c, 'utf-8')
      return `File written: ${p}`
    }

    case 'file_list': {
      const dirPath = resolvePath(input?.path as string | undefined, PROJECT_ROOT)
      const entries = await readdir(dirPath, { withFileTypes: true })
      const items = entries
        .filter((e) => !e.name.startsWith('.'))
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
        }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
      const formatted = items.map((i) => `${i.type === 'directory' ? '📁' : '📄'} ${i.name}`).join('\n')
      return `Contents of ${dirPath}:\n\n${formatted}`
    }

    case 'file_delete': {
      const p = input?.path as string | undefined
      if (!p) return 'Error: Missing "path" parameter'
      const filePath = resolvePath(p, PROJECT_ROOT)
      await unlink(filePath)
      return `File deleted: ${p}`
    }

    case 'file_search': {
      const query = input?.query as string | undefined
      if (!query) return 'Error: Missing "query" parameter'
      const searchDir = resolvePath(input?.path as string | undefined, PROJECT_ROOT)
      const escapedQuery = query.replace(/"/g, '\\"')
      try {
        const { stdout: grepOut } = await execAsync(
          `grep -r "${escapedQuery}" "${searchDir}" -l --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --include="*.md" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next 2>/dev/null | head -20`,
          { timeout: 15000 }
        )
        const { stdout: nameOut } = await execAsync(
          `find "${searchDir}" -name "*${escapedQuery}*" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.next/*" 2>/dev/null | head -20`,
          { timeout: 10000 }
        )
        const allResults = [...new Set([...grepOut.trim().split('\n'), ...nameOut.trim().split('\n')].filter(Boolean))].join('\n')
        return allResults ? `Search results for "${query}":\n${allResults}` : `No files found matching "${query}"`
      } catch {
        return `No files found matching "${query}"`
      }
    }

    case 'terminal_exec': {
      const command = input?.command as string | undefined
      if (!command) return 'Error: Missing "command" parameter'
      const cwd = input?.cwd ? safePath(input.cwd as string) : PROJECT_ROOT
      const blocked = ['rm -rf /', 'mkfs', ':(){:|:&};:', 'shutdown', 'reboot']
      if (blocked.some((b) => command.toLowerCase().includes(b))) {
        return 'Error: Command blocked for safety'
      }
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd,
          timeout: 60000,
          maxBuffer: 1024 * 1024 * 10,
          env: { ...process.env, FORCE_COLOR: '0', TERM: 'dumb' },
          shell: '/bin/zsh',
        })
        return stdout.toString() || stderr.toString() || '(no output)'
      } catch (execError: unknown) {
        const err = execError as { stdout?: string; stderr?: string; message?: string }
        return err.stdout?.toString() || err.stderr?.toString() || err.message || 'Command failed'
      }
    }

    case 'web_search': {
      const query = input?.query as string | undefined
      if (!query) return 'Error: Missing "query" parameter'
      try {
        const ZAI = (await import('z-ai-web-dev-sdk')).default
        const zai = await ZAI.create()
        const results = await zai.functions.invoke('web_search', { query, num: input?.num || 10 })
        return typeof results === 'string' ? results : JSON.stringify(results, null, 2)
      } catch {
        try {
          const ddgRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`)
          const data = await ddgRes.json()
          let result = ''
          if (data.AbstractText) result += `Summary: ${data.AbstractText}\nSource: ${data.AbstractURL}\n`
          if (data.RelatedTopics?.length > 0) {
            result += '\nRelated:\n'
            data.RelatedTopics.slice(0, 5).forEach((t: { Text?: string }) => { if (t.Text) result += `- ${t.Text}\n` })
          }
          return result || `Search: https://duckduckgo.com/?q=${encodeURIComponent(query)}`
        } catch {
          return `Search at: https://duckduckgo.com/?q=${encodeURIComponent(query)}`
        }
      }
    }

    case 'web_scrape': {
      const url = input?.url as string | undefined
      if (!url) return 'Error: Missing "url" parameter'
      try {
        const ZAI = (await import('z-ai-web-dev-sdk')).default
        const zai = await ZAI.create()
        const content = await zai.functions.invoke('page_reader', { url })
        return typeof content === 'string' ? content : JSON.stringify(content, null, 2)
      } catch {
        try {
          const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 NaviCode/1.0' } })
          const html = await res.text()
          return html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 3000)
        } catch (e) {
          return `Error: Failed to fetch ${url}: ${e}`
        }
      }
    }

    case 'system_info': {
      const os = await import('os')
      const cpus = os.cpus()
      const totalMem = os.totalmem()
      const freeMem = os.freemem()
      return [
        `System Information:`,
        `OS: ${os.platform()} ${os.arch()} (${os.release()})`,
        `Hostname: ${os.hostname()}`,
        `User: ${os.userInfo().username}`,
        `Home: ${os.homedir()}`,
        `Project Root: ${PROJECT_ROOT}`,
        `CPU: ${cpus[0]?.model} (${cpus.length} cores @ ${cpus[0]?.speed}MHz)`,
        `Memory: ${((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(2)} GB used / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB total`,
        `Node.js: ${process.version}`,
        `Uptime: ${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m`,
      ].join('\n')
    }

    case 'file_download': {
      const url = input?.url as string | undefined
      const p = input?.path as string | undefined
      if (!url || !p) return 'Error: Missing "url" or "path"'
      const destPath = resolvePath(p, PROJECT_ROOT)
      await mkdir(dirname(destPath), { recursive: true })
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP error ${res.status}`)
      const buffer = Buffer.from(await res.arrayBuffer())
      await writeFile(destPath, buffer)
      return `Downloaded ${url} to ${p} (${buffer.length} bytes)`
    }

    case 'http_client': {
      const url = input?.url as string | undefined
      if (!url) return 'Error: Missing "url" parameter'
      const method = ((input?.method as string) || 'GET').toUpperCase()
      const headers = (input?.headers as Record<string, string>) || {}
      const body = input?.body ? (typeof input.body === 'string' ? input.body : JSON.stringify(input.body)) : undefined
      try {
        const res = await fetch(url, { method, headers, body })
        const text = await res.text()
        let parsedBody
        try { parsedBody = JSON.parse(text) } catch { parsedBody = text }
        return JSON.stringify({
          status: res.status,
          statusText: res.statusText,
          headers: Object.fromEntries(res.headers.entries()),
          body: parsedBody,
        }, null, 2)
      } catch (e: any) {
        return `Error: ${e.message || 'HTTP request failed'}`
      }
    }

    case 'db_query': {
      const query = input?.query as string | undefined
      if (!query) return 'Error: Missing "query" parameter'
      const dbPath = input?.db_path ? resolvePath(input.db_path as string, PROJECT_ROOT) : resolve(PROJECT_ROOT, 'db/custom.db')
      try {
        return await runSqliteQuery(dbPath, query)
      } catch (e: any) {
        return `Error: ${e.message || 'Database query failed'}`
      }
    }

    default:
      return `Error: Unknown tool: ${tool}`
  }
}
