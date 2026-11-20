import { spawnSync } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const electron = require('electron')

const check = spawnSync(
  electron,
  ['-e', "require('better-sqlite3')(':memory:').close()"],
  { cwd: root, stdio: 'pipe', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 30000 }
)

if (check.error) {
  console.error(`Não foi possível iniciar a verificação do Electron: ${check.error.message}`)
  process.exit(1)
}

if (check.status === 0) {
  process.exit(0)
}

console.log('better-sqlite3 incompatível com o Electron; recompilando...')
const rebuild = spawnSync(process.execPath, [join(root, 'scripts/rebuild-electron-native.mjs')], {
  cwd: root,
  stdio: 'inherit'
})

process.exit(rebuild.status ?? 1)
