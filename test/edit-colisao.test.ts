import { createRequire } from 'module'
import { beforeEach, describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
let nativeOk = true
try { const D = require('better-sqlite3'); new D(':memory:').close() } catch { nativeOk = false }

// Relocalizar uma citação podia jogá-la exatamente onde outra do mesmo código
// acabara de ser deslocada: o índice único
// (documento, código, início, fim) recusava, a transação inteira fazia rollback
// e SALVAR O TEXTO FALHAVA. E falhava calado, porque o saveEditing não tem
// catch. Antes da relocalização existir, a citação era apagada e o texto salvava
// — então era regressão, não só um bug novo.
describe.skipIf(!nativeOk)('colisão de span ao relocalizar o trecho', () => {
  let db: typeof import('../src/main/db')
  let repos: typeof import('../src/main/db/repositories')
  beforeEach(async () => {
    db = await import('../src/main/db')
    repos = await import('../src/main/db/repositories')
    db.openDatabase(':memory:')
  })

  it('salvar o texto não falha quando o trecho reaparece onde outra citação foi', () => {
    const T = 'resposta muito importante'
    const antigo = `x${T} || ${T}`
    const doc = repos.createDocument({ name: 'E', plainText: antigo, originalFormat: 'txt', sourceFilename: 'e.txt' })
    const code = repos.createCode({ name: 'K', color: '#111' })
    const p1 = antigo.indexOf(T)
    const p2 = antigo.lastIndexOf(T)
    repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: p1, endPos: p1 + T.length })
    repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: p2, endPos: p2 + T.length })
    // edita o comeco: "x" -> "yy" e maiusculiza a primeira letra do primeiro T
    const novo = `yy${T[0].toUpperCase()}${T.slice(1)} || ${T}`
    expect(() => repos.updateDocumentText(doc.id, novo)).not.toThrow()

    // e o texto foi realmente gravado, não só não lançou
    expect(repos.getDocument(doc.id)?.plainText).toBe(novo)
    // a citação que colidiria é descartada, como era antes: duas marcações do
    // mesmo código no mesmo span seriam duplicata
    const citacoes = repos.listCodingsByDocument(doc.id)
    expect(citacoes).toHaveLength(1)
    expect(novo.slice(citacoes[0].startPos, citacoes[0].endPos)).toBe(T)
  })

  it('desloca citações sobre posições antigas preservando suas identidades e histórico', async () => {
    const doc = repos.createDocument({ name: 'E', plainText: 'ab--cd', originalFormat: 'txt' })
    const code = repos.createCode({ name: 'K', color: '#112233' })
    repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: 0, endPos: 2 })
    repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: 4, endPos: 6 })
    const before = repos.listCodingsByDocument(doc.id)
    repos.updateDocumentText(doc.id, 'XXXXab--cd')
    const after = repos.listCodingsByDocument(doc.id)
    expect(after.map((c) => [c.id, c.guid])).toEqual(before.map((c) => [c.id, c.guid]))
    expect(after.map((c) => [c.startPos, c.endPos])).toEqual([[4, 6], [8, 10]])
    const { historyUndo, historyRedo } = await import('../src/main/history/stack')
    historyUndo()
    expect(repos.listCodingsByDocument(doc.id)).toEqual(before)
    historyRedo()
    expect(repos.listCodingsByDocument(doc.id)).toEqual(after)
  })

  it('preserva citação curta e nota entre edições separadas, mesmo com texto repetido', async () => {
    const original = 'Título original\r\nsim\r\nsim\r\nRodapé original'
    const edited = 'Título ampliado para a revisão\r\nsim\r\nsim\r\nNovo rodapé'
    const doc = repos.createDocument({ name: 'E', plainText: original, originalFormat: 'txt' })
    const code = repos.createCode({ name: 'K', color: '#112233' })
    const start = original.lastIndexOf('sim')
    const quote = repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: start, endPos: start + 3 })
    const note = repos.createNote({ scope: 'excerpt', documentId: doc.id, startPos: start, endPos: start + 3 })

    repos.updateDocumentText(doc.id, edited)
    const next = edited.lastIndexOf('sim')
    expect(repos.listCodingsByDocument(doc.id)).toMatchObject([{ id: quote.id, startPos: next, endPos: next + 3 }])
    expect(repos.listNotesByDocument(doc.id)).toMatchObject([{ id: note.id, anchorStatus: 'attached', startPos: next, endPos: next + 3 }])

    const { historyUndo, historyRedo } = await import('../src/main/history/stack')
    historyUndo()
    expect(repos.listCodingsByDocument(doc.id)).toMatchObject([{ id: quote.id, startPos: start, endPos: start + 3 }])
    historyRedo()
    expect(repos.listCodingsByDocument(doc.id)).toMatchObject([{ id: quote.id, startPos: next, endPos: next + 3 }])
  })

  it('preserva o documento e as marcações se o cálculo excede o limite', () => {
    const original = 'a'.repeat(700)
    const doc = repos.createDocument({ name: 'E', plainText: original, originalFormat: 'txt' })
    const code = repos.createCode({ name: 'K', color: '#112233' })
    const quote = repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: 24, endPos: 30 })
    expect(() => repos.updateDocumentText(doc.id, 'b'.repeat(700))).toThrow('Salve as alterações em etapas.')
    expect(repos.getDocument(doc.id)?.plainText).toBe(original)
    expect(repos.listCodingsByDocument(doc.id)).toMatchObject([{ id: quote.id, startPos: 24, endPos: 30 }])
  })
})
