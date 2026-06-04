import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import os from 'os'

const execAsync = promisify(exec)
const PROJECT_ROOT = process.env.NAVICODE_ROOT || process.env.ZCODE_ROOT || process.cwd()

export async function GET() {
  try {
    const cpus = os.cpus()
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem

    // Get disk usage (works on both Mac and Linux)
    let diskInfo = { total: 0, used: 0, available: 0 }
    try {
      const { stdout } = await execAsync(`df -k "${PROJECT_ROOT}" | tail -1 | awk '{print $2,$3,$4}'`)
      const parts = stdout.trim().split(/\s+/)
      if (parts.length >= 3) {
        diskInfo = {
          total: parseInt(parts[0]) * 1024,
          used: parseInt(parts[1]) * 1024,
          available: parseInt(parts[2]) * 1024,
        }
      }
    } catch {
      // Ignore disk info errors
    }

    // Get git info
    let gitBranch = 'unknown'
    try {
      const { stdout } = await execAsync(`git -C "${PROJECT_ROOT}" rev-parse --abbrev-ref HEAD`)
      gitBranch = stdout.trim()
    } catch {
      // Not a git repo
    }

    // Get running processes count
    let processCount = 0
    try {
      const { stdout } = await execAsync('ps aux | wc -l')
      processCount = parseInt(stdout.trim()) - 1
    } catch {
      // Ignore
    }

    // Get uptime
    const uptime = os.uptime()
    const days = Math.floor(uptime / 86400)
    const hours = Math.floor((uptime % 86400) / 3600)
    const minutes = Math.floor((uptime % 3600) / 60)

    return NextResponse.json({
      success: true,
      os: {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        hostname: os.hostname(),
        uptime: `${days}d ${hours}h ${minutes}m`,
        homedir: os.homedir(),
        username: os.userInfo().username,
      },
      cpu: {
        model: cpus[0]?.model || 'Unknown',
        cores: cpus.length,
        speed: cpus[0]?.speed || 0,
      },
      memory: {
        total: formatBytes(totalMem),
        used: formatBytes(usedMem),
        free: formatBytes(freeMem),
        usagePercent: ((usedMem / totalMem) * 100).toFixed(1) + '%',
      },
      disk: {
        total: formatBytes(diskInfo.total),
        used: formatBytes(diskInfo.used),
        available: formatBytes(diskInfo.available),
      },
      project: {
        root: PROJECT_ROOT,
        gitBranch,
        nodeVersion: process.version,
      },
      processes: processCount,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
