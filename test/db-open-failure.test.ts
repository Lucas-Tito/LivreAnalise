import { createRequire } from 'module'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
let nativeOk = true
let Database: typeof import('better-sqlite3') | null = null
try {
  Database = require('better-sqlite3')
  new Database(':memory:').close()
} catch {
  nativeOk = false
}

// Abrir um projeto que falha na migração não pode derrubar o que já estava
// aberto. Antes o `openDatabase` fechava o atual ANTES de tentar o novo: o app
// ficava sem banco, a tela seguia mostrando o projeto anterior, e toda ação
// seguinte morria com "Nenhum projeto aberto" até reabrir na mão.
describe.skipIf(!nativeOk)('abertura de projeto que falha', () => {
  let db: typeof import('../src/main/db')
  let tempDir = ''

  beforeEach(async () => {
    db = await import('../src/main/db')
    tempDir = mkdtempSync(join(tmpdir(), 'atlas-open-'))
  })

  afterEach(() => {
    db.closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  // Um projeto carimbado com schema maior que o suportado é o caminho de
  // exceção que o próprio PR introduziu, então serve de gatilho realista.
  function criarProjetoDoFuturo(nome: string): string {
    const caminho = join(tempDir, nome)
    const raw = new Database!(caminho)
    raw.pragma('user_version = 99')
    raw.close()
    return caminho
  }

  it('mantém o projeto anterior aberto quando o novo falha', () => {
    const bom = join(tempDir, 'bom.liva')
    db.openDatabase(bom)
    expect(db.getActivePath()).toBe(bom)

    const ruim = criarProjetoDoFuturo('futuro.liva')
    expect(() => db.openDatabase(ruim)).toThrow(/versão mais nova/i)

    expect(db.hasActiveProject()).toBe(true)
    expect(db.getActivePath()).toBe(bom)
  })

  it('deixa o projeto anterior utilizável, não só registrado', () => {
    const bom = join(tempDir, 'bom.liva')
    db.openDatabase(bom)

    expect(() => db.openDatabase(criarProjetoDoFuturo('futuro.liva'))).toThrow()

    // a conexão precisa responder: `active` apontar para um handle fechado
    // seria o mesmo defeito com outra aparência
    const linha = db.getRaw().prepare('SELECT count(*) AS n FROM codes').get() as { n: number }
    expect(linha.n).toBe(0)
  })
})
