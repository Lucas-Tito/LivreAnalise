import { createRequire } from 'module'
import { beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
let nativeOk = true
try {
  // require sozinho não basta: o dlopen é lazy e só falha no new Database.
  const Database = require('better-sqlite3')
  new Database(':memory:').close()
} catch {
  nativeOk = false
}

describe.skipIf(!nativeOk)('moveCodes (integration)', () => {
  let db: typeof import('../src/main/db')
  let repos: typeof import('../src/main/db/repositories')

  beforeEach(async () => {
    db = await import('../src/main/db')
    repos = await import('../src/main/db/repositories')
    db.openDatabase(':memory:')
  })

  it('moves several codes atomically preserving citations', async () => {
    const group = repos.createCode({ name: 'Grupo', color: '#111' })
    const a = repos.createCode({ name: 'A', color: '#222' })
    const b = repos.createCode({ name: 'B', color: '#333' })
    const doc = repos.createDocument({
      name: 'Doc',
      plainText: 'abcdefghij',
      originalFormat: 'txt',
      sourceFilename: 'd.txt'
    })
    repos.createCoding({ documentId: doc.id, codeId: a.id, startPos: 0, endPos: 4 })

    repos.moveCodes({ ids: [a.id, b.id], parentId: group.id })

    const codes = repos.listCodes()
    expect(codes.find((c) => c.id === a.id)?.parentId).toBe(group.id)
    expect(codes.find((c) => c.id === b.id)?.parentId).toBe(group.id)
    const coding = repos.listCodingsByDocument(doc.id)
    expect(coding).toHaveLength(1)
    expect(coding[0].codeId).toBe(a.id)
    db.closeDatabase()
  })

  it('is atomic: one invalid move aborts the whole batch', async () => {
    const group = repos.createCode({ name: 'Grupo', color: '#111' })
    const child = repos.createCode({ name: 'Filho', color: '#222', parentId: group.id })
    const loose = repos.createCode({ name: 'Solto', color: '#333' })
    // child já é 2º nível: não pode ser destino (criaria 3º nível)
    expect(() => repos.moveCodes({ ids: [loose.id], parentId: child.id })).toThrow()
    const codes = repos.listCodes()
    expect(codes.find((c) => c.id === loose.id)?.parentId).toBeNull()
    db.closeDatabase()
  })

  it('refuses group-into-group', async () => {
    const g1 = repos.createCode({ name: 'G1', color: '#111' })
    repos.createCode({ name: 'F1', color: '#222', parentId: g1.id })
    const g2 = repos.createCode({ name: 'G2', color: '#333' })
    repos.createCode({ name: 'F2', color: '#444', parentId: g2.id })
    expect(() => repos.moveCodes({ ids: [g1.id], parentId: g2.id })).toThrow()
    db.closeDatabase()
  })

  it('unites codes in a new group keeping citations', async () => {
    const a = repos.createCode({ name: 'A', color: '#222' })
    const b = repos.createCode({ name: 'B', color: '#333' })
    const doc = repos.createDocument({
      name: 'Doc',
      plainText: 'abcdefghij',
      originalFormat: 'txt',
      sourceFilename: 'd.txt'
    })
    repos.createCoding({ documentId: doc.id, codeId: b.id, startPos: 2, endPos: 5 })

    const group = repos.createGroupFromCodes('Meu grupo', '#111', [a.id, b.id])

    const codes = repos.listCodes()
    expect(codes.find((c) => c.id === group.id)?.parentId).toBeNull()
    expect(codes.find((c) => c.id === a.id)?.parentId).toBe(group.id)
    expect(codes.find((c) => c.id === b.id)?.parentId).toBe(group.id)
    const coding = repos.listCodingsByDocument(doc.id)
    expect(coding).toHaveLength(1)
    expect(coding[0].codeId).toBe(b.id)
    db.closeDatabase()
  })

  it('does not unite a group inside another group', async () => {
    const g1 = repos.createCode({ name: 'G1', color: '#111' })
    repos.createCode({ name: 'F1', color: '#222', parentId: g1.id })
    const leaf = repos.createCode({ name: 'Folha', color: '#333' })
    expect(() => repos.createGroupFromCodes('X', '#444', [g1.id, leaf.id])).toThrow()
    const codes = repos.listCodes()
    expect(codes.find((c) => c.id === leaf.id)?.parentId).toBeNull()
    db.closeDatabase()
  })

  it('undoes the union as one step', async () => {
    const history = await import('../src/main/history/stack')
    const a = repos.createCode({ name: 'A', color: '#222' })
    const b = repos.createCode({ name: 'B', color: '#333' })
    history.clearAllHistory()
    repos.createGroupFromCodes('Meu grupo', '#111', [a.id, b.id])
    expect(repos.listCodes()).toHaveLength(3)

    history.historyUndo()
    const codes = repos.listCodes()
    expect(codes).toHaveLength(2)
    expect(codes.find((c) => c.id === a.id)?.parentId).toBeNull()
    expect(codes.find((c) => c.id === b.id)?.parentId).toBeNull()
    db.closeDatabase()
  })

  it('reorders a code among its siblings', async () => {
    const a = repos.createCode({ name: 'A', color: '#111' })
    const b = repos.createCode({ name: 'B', color: '#222' })
    const c = repos.createCode({ name: 'C', color: '#333' })

    // C vai para antes de A: a lista precisa deixar de ser alfabética.
    repos.moveCodes({ ids: [c.id], parentId: null, anchorId: a.id, position: 'before' })

    expect(repos.listCodes().map((x) => x.name)).toEqual(['C', 'A', 'B'])
    db.closeDatabase()
  })

  it('moves a code into a group at the dropped position', async () => {
    const group = repos.createCode({ name: 'Grupo', color: '#111' })
    const first = repos.createCode({ name: 'F1', color: '#222', parentId: group.id })
    repos.createCode({ name: 'F2', color: '#333', parentId: group.id })
    const loose = repos.createCode({ name: 'Solto', color: '#444' })

    repos.moveCodes({
      ids: [loose.id],
      parentId: group.id,
      anchorId: first.id,
      position: 'before'
    })

    const children = repos
      .listCodes()
      .filter((x) => x.parentId === group.id)
      .map((x) => x.name)
    expect(children).toEqual(['Solto', 'F1', 'F2'])
    db.closeDatabase()
  })

  it('undoes a reorder back to the previous order', async () => {
    const history = await import('../src/main/history/stack')
    const a = repos.createCode({ name: 'A', color: '#111' })
    repos.createCode({ name: 'B', color: '#222' })
    const c = repos.createCode({ name: 'C', color: '#333' })
    history.clearAllHistory()

    repos.moveCodes({ ids: [c.id], parentId: null, anchorId: a.id, position: 'before' })
    expect(repos.listCodes().map((x) => x.name)).toEqual(['C', 'A', 'B'])

    history.historyUndo()
    expect(repos.listCodes().map((x) => x.name)).toEqual(['A', 'B', 'C'])
    db.closeDatabase()
  })

  // A versão anterior movia [C,D] para depois de B, que já era a ordem corrente:
  // o isNoopMove devolvia true, o moveCodes saía sem tocar no banco, e a
  // asserção descrevia o ponto de partida — passava com o moveCodes comentado.
  //
  // E o nome prometia a coisa errada: o computeMoveOrder faz `.sort(siblingOrder)`
  // na seleção, então o que se preserva é a ordem VISUAL dos códigos, não a
  // ordem em que foram clicados. Isso é deliberado e é a propriedade que vale
  // travar: arrastar um grupo de códigos não embaralha quem estava em cima.
  it('reorders a multi-selection keeping their visible order', async () => {
    const a = repos.createCode({ name: 'A', color: '#111' })
    repos.createCode({ name: 'B', color: '#222' })
    const c = repos.createCode({ name: 'C', color: '#333' })
    const d = repos.createCode({ name: 'D', color: '#444' })

    repos.moveCodes({ ids: [d.id, c.id], parentId: null, anchorId: a.id, position: 'after' })

    // C continua antes de D, embora D tenha sido o primeiro da seleção
    expect(repos.listCodes().map((x) => x.name)).toEqual(['A', 'C', 'D', 'B'])
    db.closeDatabase()
  })

  it('a ordem dos cliques não muda o resultado', async () => {
    const a = repos.createCode({ name: 'A', color: '#111' })
    repos.createCode({ name: 'B', color: '#222' })
    const c = repos.createCode({ name: 'C', color: '#333' })
    const d = repos.createCode({ name: 'D', color: '#444' })

    repos.moveCodes({ ids: [c.id, d.id], parentId: null, anchorId: a.id, position: 'after' })

    expect(repos.listCodes().map((x) => x.name)).toEqual(['A', 'C', 'D', 'B'])
    db.closeDatabase()
  })

  // Devolver ao mesmo lugar não é erro e não empilha desfazer: sai sem tocar
  // em nada.
  it('treats dropping a code where it already is as a silent no-op', async () => {
    const history = await import('../src/main/history/stack')
    const a = repos.createCode({ name: 'A', color: '#111' })
    const b = repos.createCode({ name: 'B', color: '#222' })
    repos.createCode({ name: 'C', color: '#333' })
    history.clearAllHistory()

    // B já está logo depois de A: soltar "depois de A" não muda nada.
    repos.moveCodes({ ids: [b.id], parentId: null, anchorId: a.id, position: 'after' })

    expect(repos.listCodes().map((x) => x.name)).toEqual(['A', 'B', 'C'])
    expect(history.historyState().canUndo).toBe(false)
    db.closeDatabase()
  })

  it('treats choosing the current group in the move dialog as a no-op', async () => {
    const history = await import('../src/main/history/stack')
    const group = repos.createCode({ name: 'Grupo', color: '#111' })
    const member = repos.createCode({ name: 'M', color: '#222', parentId: group.id })
    history.clearAllHistory()

    repos.moveCodes({ ids: [member.id], parentId: group.id })

    expect(repos.listCodes().find((x) => x.id === member.id)?.parentId).toBe(group.id)
    expect(history.historyState().canUndo).toBe(false)
    db.closeDatabase()
  })

  // Regressão: o desempate de nome precisa ser a colação BINARY do
  // ORDER BY name do SQLite, que é o que a lista mostra. Importar QDPX grava
  // todos os códigos com sort_order 0 (default do schema), então o desempate
  // por nome decide a ordem — e com localeCompare('pt-BR') nomes acentuados
  // vinham em outra ordem, fazendo um arrasto real ser julgado no-op.
  it('reorders tied accented names the way the list displays them', async () => {
    const fala = repos.createCode({ name: 'Fala', color: '#111' })
    const acao = repos.createCode({ name: 'ação', color: '#222' })
    // sort_order empatado, como a importação QDPX deixa (o insert dela não
    // manda sort_order e o default do schema é 0). É o desempate por nome que
    // decide a ordem exibida.
    db.getRaw().prepare('UPDATE codes SET sort_order = 0').run()

    // A lista mostra Fala primeiro (BINARY: 'F' < 'a').
    expect(repos.listCodes().map((x) => x.name)).toEqual(['Fala', 'ação'])

    repos.moveCodes({
      ids: [acao.id],
      parentId: null,
      anchorId: fala.id,
      position: 'before'
    })

    expect(repos.listCodes().map((x) => x.name)).toEqual(['ação', 'Fala'])
    db.closeDatabase()
  })
})
