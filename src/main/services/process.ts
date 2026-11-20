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
    const windows = process.platform === 'win32'
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'], env: options.env, detached: !windows, windowsHide: true
    })
    let stderr = ''
    let stopTree: Promise<void> | undefined
    const abort = (): void => {
      if (!child.pid) return
      if (!windows) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill('SIGKILL')
        }
        // Um wrapper pode deixar pipes abertos em outra sessão. Aguarde o
        // processo direto, sem depender do fechamento dos pipes herdados.
        child.stdout.destroy()
        child.stderr.destroy()
        return
      }
      stopTree = new Promise((done) => {
        const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
          stdio: 'ignore', windowsHide: true
        })
        const finish = (): void => {
          child.kill()
          child.stdout.destroy()
          child.stderr.destroy()
          done()
        }
        killer.once('error', finish)
        killer.once('close', finish)
      })
    }
    const cleanup = (): void => options.signal?.removeEventListener('abort', abort)
    // StringDecoder interno do stream mantém bytes UTF-8 incompletos entre chunks.
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => options.onStdout?.(chunk))
    child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-16_384) })
    child.once('error', (error) => { cleanup(); reject(error) })
    child.once('close', async (code) => {
      cleanup()
      if (stopTree) await stopTree
      if (options.signal?.aborted) reject(options.signal.reason)
      else resolve({ code, stderr })
    })
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) abort()
  })
}
