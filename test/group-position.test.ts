import { createRequire } from 'module'
import { beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
let nativeOk = true
try {
  const Database = require('better-sqlite3')
  new Database(':memory:').close()
} catch {
  nativeOk = false
}

// O grupo criado pelo arrasto nascia sem sortOrder, caía no DEFAULT 0 do schema
// e saltava para o topo da lista — longe do gesto que o criou. Em 399 códigos
// isso é o grupo sumindo da vista no instante em que a pessoa o cria.
describe.skipIf(!nativeOk)('posição do grupo criado a partir de códigos', () => {
  let db: typeof import('../src/main/db')
  let repos: typeof import('../src/main/db/repositories')

  beforeEach(async () => {
    db = await import('../src/main/db')
    repos = await import('../src/main/db/repositories')
    db.openDatabase(':memory:')
  })

  const nomesNaRaiz = (): string[] =>
    repos
      .listCodes()
      .filter((c) => c.parentId === null)
      .map((c) => c.name)

  it('nasce onde os membros estavam, não no topo', () => {
    // A, B, C, D em ordem; agrupar C e D deve deixar o grupo no lugar do C
    const criados = ['A', 'B', 'C', 'D'].map((name) => repos.createCode({ name, color: '#111' }))
    const grupo = repos.createGroupFromCodes('Grupo', '#222', [criados[2].id, criados[3].id])

    expect(nomesNaRaiz()).toEqual(['A', 'B', 'Grupo'])
    expect(grupo.sortOrder).toBe(criados[2].sortOrder)
  })

  it('não vai para o topo quando os membros estavam no fim', () => {
    const criados = ['A', 'B', 'C'].map((name) => repos.createCode({ name, color: '#111' }))
    repos.createGroupFromCodes('Zebra', '#222', [criados[2].id])

    // com sortOrder 0 ele empataria com o 'A' e o desempate por nome o poria
    // na frente; o nome foi escolhido para denunciar isso
    expect(nomesNaRaiz()).toEqual(['A', 'B', 'Zebra'])
  })

  it('cai no fim da raiz quando nenhum membro estava na raiz', () => {
    const pai = repos.createCode({ name: 'Pai', color: '#111' })
    const filho = repos.createCode({ name: 'Filho', color: '#111', parentId: pai.id })
    const raiz = repos.createCode({ name: 'Zzz', color: '#111' })

    repos.createGroupFromCodes('Novo', '#222', [filho.id])

    expect(nomesNaRaiz()).toEqual(['Pai', 'Zzz', 'Novo'])
    expect(raiz.parentId).toBeNull()
  })
})
