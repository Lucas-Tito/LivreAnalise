import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
// O posttest do npm não roda quando a suíte falha. Esta restauração fica no
// próprio runner, para não deixar o aplicativo com o ABI do Node nesse caso.
const result = spawnSync(process.execPath, [require.resolve('vitest/vitest.mjs'), 'run', ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit'
})
const rebuilt = spawnSync(process.execPath, [join(root, 'scripts/rebuild-electron-native.mjs')], {
  cwd: root, stdio: 'inherit'
})
if (result.error) console.error(result.error.message)
if (rebuilt.error) console.error(rebuilt.error.message)
process.exit(result.status === 0 ? rebuilt.status ?? 1 : result.status ?? 1)
