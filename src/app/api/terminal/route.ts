import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const PROJECT_ROOT = '/home/z/my-project'

const BLOCKED_COMMANDS = [
  'rm -rf /', 'mkfs', 'dd if=', 'format', ':(){:|:&};:',
  'shutdown', 'reboot', 'init 0', 'init 6',
]

function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  const lowerCmd = command.toLowerCase().trim()
  for (const blocked of BLOCKED_COMMANDS) {
    if (lowerCmd.includes(blocked.toLowerCase())) {
      return { safe: false, reason: `Blocked command pattern: ${blocked}` }
    }
  }
  return { safe: true }
}

export async function POST(request: NextRequest) {
  try {
    const { command, cwd, timeout = 30000, autoApprove = false } = await request.json()

    if (!command || typeof command !== 'string') {
      return NextResponse.json({ error: 'Command is required' }, { status: 400 })
    }

    // Safety check
    const safety = isCommandSafe(command)
    if (!safety.safe) {
      return NextResponse.json({
        success: false,
        error: safety.reason,
        output: '',
        requiresConfirmation: true,
      })
    }

    const workingDir = cwd || PROJECT_ROOT
    const maxTimeout = Math.min(timeout, 120000)

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDir,
        timeout: maxTimeout,
        maxBuffer: 1024 * 1024 * 10,
        env: { ...process.env, FORCE_COLOR: '0', TERM: 'dumb' },
      })

      return NextResponse.json({
        success: true,
        output: stdout.toString(),
        error: stderr.toString() || undefined,
        command,
        cwd: workingDir,
        exitCode: 0,
      })
    } catch (execError: unknown) {
      const err = execError as { stdout?: string; stderr?: string; code?: number; killed?: boolean }
      return NextResponse.json({
        success: false,
        output: err.stdout?.toString() || '',
        error: err.stderr?.toString() || (execError as Error).message,
        command,
        cwd: workingDir,
        exitCode: err.code || 1,
        killed: err.killed || false,
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
