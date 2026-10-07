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

// `anchorStatus: 'attached'` só era escrito ao criar a nota e ao importar um
// QDPX. Uma nota desvinculada por uma edição de texto não tinha volta: as
// saídas eram desfazer na hora (um passo só) ou apagar e reescrever, perdendo o
// que a pessoa tinha escrito.
describe.skipIf(!nativeOk)('religar nota desvinculada', () => {
  let db: typeof import('../src/main/db')
  let repos: typeof import('../src/main/db/repositories')
  let history: typeof import('../src/main/history/stack')

  beforeEach(async () => {
    db = await import('../src/main/db')
    repos = await import('../src/main/db/repositories')
    history = await import('../src/main/history/stack')
    db.openDatabase(':memory:')
  })

  const nota = (docId: number): import('../src/shared/types').Note =>
    repos.listNotesByDocument(docId)[0]

  function notaDesvinculada(): { docId: number; noteId: number } {
    const doc = repos.createDocument({
      name: 'Entrevista',
      plainText: 'abcdefghij',
      originalFormat: 'txt',
      sourceFilename: 'e.txt'
    })
    const note = repos.createNote({
      scope: 'excerpt',
      documentId: doc.id,
      startPos: 2,
      endPos: 5,
      body: 'o entrevistado se contradiz'
    })
    // apaga 'efgh': cruza a borda da âncora [2,5) e a invalida
    repos.updateDocumentText(doc.id, 'abcdij')
    expect(nota(doc.id).anchorStatus).toBe('detached')
    return { docId: doc.id, noteId: note.id }
  }

  it('volta a ancorar e descarta o trecho guardado', () => {
    const { noteId } = notaDesvinculada()

    const religada = repos.updateNote({ id: noteId, startPos: 1, endPos: 4 })

    expect(religada.anchorStatus).toBe('attached')
    expect(religada.startPos).toBe(1)
    expect(religada.endPos).toBe(4)
    // o trecho original só existe para a pessoa não perder o contexto enquanto
    // a nota está solta; com âncora de novo ele perde o sentido
    expect(religada.anchorText).toBeNull()
  })

  it('preserva o que a pessoa escreveu', () => {
    const { noteId } = notaDesvinculada()
    const religada = repos.updateNote({ id: noteId, startPos: 1, endPos: 4 })
    expect(religada.body).toBe('o entrevistado se contradiz')
  })

  it('desfazer devolve a nota ao estado desvinculado', () => {
    const { docId, noteId } = notaDesvinculada()
    const antes = nota(docId)
    repos.updateNote({ id: noteId, startPos: 1, endPos: 4 })

    history.historyUndo()

    const depois = nota(docId)
    expect(depois.anchorStatus).toBe('detached')
    expect(depois.anchorText).toBe(antes.anchorText)
  })

  it('editar só o texto não mexe na âncora', () => {
    const { docId, noteId } = notaDesvinculada()
    const antes = nota(docId)

    const depois = repos.updateNote({ id: noteId, body: 'outro texto' })

    expect(depois.body).toBe('outro texto')
    expect(depois.anchorStatus).toBe('detached')
    expect(depois.anchorText).toBe(antes.anchorText)
  })
})
