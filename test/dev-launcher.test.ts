import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fileURLToPath } from 'node:url'

const { spawnSync } = vi.hoisted(() => ({ spawnSync: vi.fn() }))
vi.mock('node:child_process', () => ({ spawnSync }))

beforeEach(() => {
  vi.resetModules()
  spawnSync.mockReset().mockReturnValue({ status: 0 })
  vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'scripts/dev.mjs'])
  vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('launcher exited') })
})

afterEach(() => { vi.restoreAllMocks() })

async function launch(platform: NodeJS.Platform) {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform)
  // @ts-expect-error O launcher e um script JavaScript sem declaracao de tipos.
  await expect(import('../scripts/dev.mjs')).rejects.toThrow('launcher exited')
  return spawnSync.mock.calls[0]
}

it('passes the Linux sandbox opt-out to the launcher before forwarded arguments', async () => {
  vi.spyOn(process, 'argv', 'get').mockReturnValue([
    'node', 'scripts/dev.mjs', '--', '--disable-dev-shm-usage'
  ])
  const [command, args, options] = await launch('linux')
  expect(command).toBe(process.execPath)
  expect(args).toEqual([
    expect.stringMatching(/electron-vite[/\\]bin[/\\]electron-vite\.js$/),
    'dev', '--noSandbox', '--', '--disable-dev-shm-usage'
  ])
  expect(options).toEqual({ cwd: fileURLToPath(new URL('..', import.meta.url)).replace(/[/\\]$/, ''), stdio: 'inherit' })
  expect(process.exit).toHaveBeenCalledWith(0)
})

it.each(['win32', 'darwin'] as const)('keeps the sandbox enabled on %s', async (platform) => {
  const [, args] = await launch(platform)
  expect(args.slice(1)).toEqual(['dev'])
})

it('does not duplicate an explicit noSandbox option', async () => {
  vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'scripts/dev.mjs', '--noSandbox'])
  const [, args] = await launch('linux')
  expect(args.slice(1)).toEqual(['dev', '--noSandbox'])
})

it('propagates the launcher exit status', async () => {
  spawnSync.mockReturnValue({ status: 7 })
  await launch('linux')
  expect(process.exit).toHaveBeenCalledWith(7)
})

it('reports a spawn failure and exits unsuccessfully', async () => {
  spawnSync.mockReturnValue({ status: null, error: new Error('spawn failed') })
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  await launch('linux')
  expect(error).toHaveBeenCalledWith('spawn failed')
  expect(process.exit).toHaveBeenCalledWith(1)
})

it('uses the preview command and passes the Linux sandbox option', async () => {
  vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'scripts/dev.mjs', 'preview'])
  const [, args] = await launch('linux')
  expect(args.slice(1)).toEqual(['preview', '--noSandbox'])
})
