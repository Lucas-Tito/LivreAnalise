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

const TRECHO = 'o entrevistado se contradiz sobre o prazo'
const ABERTURA = 'Comeco do documento. '
const FIM = ' E o texto segue depois disso.'

// Quando a edição atravessa o trecho marcado, a citação era APAGADA e a nota
// desvinculada — mesmo quando o texto continuava inteiro no documento, só que
// em outro lugar. Agora o trecho é procurado antes de desistir.
describe.skipIf(!nativeOk)('reencontrar o trecho depois de editar o texto', () => {
  let db: typeof import('../src/main/db')
  let repos: typeof import('../src/main/db/repositories')

  beforeEach(async () => {
    db = await import('../src/main/db')
    repos = await import('../src/main/db/repositories')
    db.openDatabase(':memory:')
  })

  function cenario(): { docId: number; codingId: number; noteId: number } {
    const textoAntigo = `${ABERTURA}${TRECHO}${FIM}`
    const doc = repos.createDocument({
      name: 'Entrevista',
      plainText: textoAntigo,
      originalFormat: 'txt',
      sourceFilename: 'e.txt'
    })
    const code = repos.createCode({ name: 'PRAZO', color: '#111' })
    const inicio = textoAntigo.indexOf(TRECHO)
    const coding = repos.createCoding({
      documentId: doc.id,
      codeId: code.id,
      startPos: inicio,
      endPos: inicio + TRECHO.length
    })
    const note = repos.createNote({
      scope: 'excerpt',
      documentId: doc.id,
      startPos: inicio,
      endPos: inicio + TRECHO.length,
      body: 'contradição com a resposta anterior'
    })
    return { docId: doc.id, codingId: coding.id, noteId: note.id }
  }

  // o trecho vai para o fim: o diff cobre a âncora inteira e a invalida
  const textoReordenado = `${FIM.trim()} ${ABERTURA}${TRECHO}`

  it('a citação sobrevive à reordenação em vez de ser apagada', () => {
    const { docId, codingId } = cenario()

    repos.updateDocumentText(docId, textoReordenado)

    const citacoes = repos.listCodingsByDocument(docId)
    expect(citacoes).toHaveLength(1)
    expect(citacoes[0].id).toBe(codingId)
    const doc = repos.getDocument(docId)!
    expect(doc.plainText.slice(citacoes[0].startPos, citacoes[0].endPos)).toBe(TRECHO)
  })

  it('a nota continua ancorada, sem virar desvinculada', () => {
    const { docId } = cenario()

    repos.updateDocumentText(docId, textoReordenado)

    const nota = repos.listNotesByDocument(docId)[0]
    expect(nota.anchorStatus).toBe('attached')
    const doc = repos.getDocument(docId)!
    expect(doc.plainText.slice(nota.startPos!, nota.endPos!)).toBe(TRECHO)
  })

  // Edição que começa dentro da âncora e passa do fim dela: é o caso em que o
  // ajuste de posição não tem o que salvar.
  const textoAntigo = `${ABERTURA}${TRECHO}${FIM}`
  const inicio = textoAntigo.indexOf(TRECHO)
  const destruidoNoLugar = textoAntigo.slice(0, inicio + 20) + textoAntigo.slice(inicio + 60)

  it('o trecho apagado de verdade continua se perdendo', () => {
    const { docId } = cenario()

    repos.updateDocumentText(docId, destruidoNoLugar)

    expect(repos.listCodingsByDocument(docId)).toHaveLength(0)
    const nota = repos.listNotesByDocument(docId)[0]
    expect(nota.anchorStatus).toBe('detached')
    expect(nota.anchorText).toBe(TRECHO)
  })

  // Duas ocorrências não dá para escolher: volta ao comportamento antigo, e a
  // nota guarda o trecho para a pessoa religar à mão.
  it('não adivinha quando o trecho passa a aparecer duas vezes', () => {
    const { docId } = cenario()

    repos.updateDocumentText(docId, `${destruidoNoLugar} ${TRECHO} e tambem ${TRECHO}`)

    expect(repos.listCodingsByDocument(docId)).toHaveLength(0)
    const nota = repos.listNotesByDocument(docId)[0]
    expect(nota.anchorStatus).toBe('detached')
  })
})
