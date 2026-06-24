import { spawnSync } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const electron = join(root, 'node_modules/.bin/electron')

const check = spawnSync(
  electron,
  ['-e', "require('better-sqlite3')(':memory:')"],
  { cwd: root, stdio: 'pipe' }
)

if (check.status === 0) {
  process.exit(0)
}

console.log('better-sqlite3 incompatível com o Electron; recompilando...')
const rebuild = spawnSync('npm', ['run', 'rebuild'], {
  cwd: root,
  stdio: 'inherit',
  shell: true
})

process.exit(rebuild.status ?? 1)
