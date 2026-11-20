import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const cli = require.resolve('@electron/rebuild/lib/cli.js', {
  paths: [dirname(require.resolve('app-builder-lib/package.json'))]
})
// Somente o artefato nativo gerado; não depende de rm/bash no Windows.
rmSync(join(root, 'node_modules/better-sqlite3/build'), { recursive: true, force: true })
const result = spawnSync(process.execPath, [cli, '-f', '-w', 'better-sqlite3'], { cwd: root, stdio: 'inherit' })
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
