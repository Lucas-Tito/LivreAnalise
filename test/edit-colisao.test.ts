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
})
