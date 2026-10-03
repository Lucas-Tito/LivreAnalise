// Avisos de ambiente para a suíte. O skip de testes de integração é
// silencioso por padrão (describe.skipIf): sem este aviso, uma máquina com
// better-sqlite3 no ABI errado teria suíte "verde" com dezenas de skips.
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
try {
  const Database = require('better-sqlite3')
  new Database(':memory:').close()
} catch (err) {
  console.warn(
    '\n[aviso] better-sqlite3 não carregou no ABI do Node — os testes de ' +
      'integração estão sendo PULADOS e a suíte fica verde sem validá-los. ' +
      `Motivo: ${(err as Error).message}\n` +
      'Rode o pretest (npm test) ou:\n' +
      '  cd node_modules/better-sqlite3 && node ../prebuild-install/bin.js\n'
  )
}