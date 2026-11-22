import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const viteRoot = dirname(require.resolve('electron-vite/package.json'))
const forwarded = process.argv.slice(2)
const command = forwarded[0] === 'preview' ? forwarded.shift() : 'dev'
const args = [command, ...forwarded]

// No Linux, o opt-out precisa chegar ao Electron antes de iniciar o zygote.
// appendSwitch no main e tarde demais e pode causar erros ESRCH em /dev/shm.
// Este launcher é usado apenas em desenvolvimento e no preview local.
if (process.platform === 'linux' && !args.includes('--noSandbox')) {
  args.splice(1, 0, '--noSandbox')
}

const result = spawnSync(process.execPath, [join(viteRoot, 'bin/electron-vite.js'), ...args], {
  cwd: root, stdio: 'inherit'
})
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
