import { spawn } from 'child_process'

interface ProcessOptions {
  signal?: AbortSignal
  env?: NodeJS.ProcessEnv
  onStdout?: (chunk: string) => void
}

export async function runProcess(
  command: string,
  args: string[],
  options: ProcessOptions = {}
): Promise<{ code: number | null; stderr: string }> {
  options.signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: options.env })
    let stderr = ''
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const abort = (): void => {
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), 2000)
      killTimer.unref()
    }
    const cleanup = (): void => {
      options.signal?.removeEventListener('abort', abort)
      if (killTimer) clearTimeout(killTimer)
    }
    // StringDecoder interno do stream mantém bytes UTF-8 incompletos entre chunks.
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => options.onStdout?.(chunk))
    child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-16_384) })
    child.once('error', (error) => { cleanup(); reject(error) })
    child.once('close', (code) => {
      cleanup()
      if (options.signal?.aborted) reject(options.signal.reason)
      else resolve({ code, stderr })
    })
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) abort()
  })
}
