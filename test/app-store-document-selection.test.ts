import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../src/renderer/src/stores/appStore'
import type { Coding, DocumentWithText, Note } from '../src/shared/types'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const interviews: DocumentWithText[] = [1, 2].map((id) => ({
  id,
  guid: `document-${id}`,
  name: `Entrevista ${id}`,
  originalFormat: 'txt',
  sourceFilename: null,
  charCount: id === 1 ? 1000 : 20,
  importedAt: '2026-10-06',
  plainText: 'a'.repeat(id === 1 ? 1000 : 20)
}))

const firstCodings: Coding[] = Array.from({ length: 8 }, (_, index) => ({
  id: index + 1,
  guid: `coding-${index}`,
  documentId: 1,
  codeId: index + 1,
  startPos: index * 100,
  endPos: index * 100 + 50,
  createdAt: '2026-10-06'
}))

const firstNotes: Note[] = [{
  id: 1,
  guid: 'note-1',
  title: null,
  body: 'Nota da primeira entrevista',
  scope: 'excerpt',
  documentId: 1,
  startPos: 100,
  endPos: 150,
  anchorStatus: 'attached',
  anchorText: 'a'.repeat(50),
  createdAt: '2026-10-06',
  updatedAt: '2026-10-06'
}]

describe('document selection', () => {
  let unsubscribe: (() => void) | undefined
  const getDocument = vi.fn()
  const listCodings = vi.fn()
  const listNotes = vi.fn()

  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    useAppStore.setState({
      currentDocument: interviews[0],
      codings: firstCodings,
      documentNotes: firstNotes,
      navigateNoteId: 1,
      editorNoteId: 1
    })
    getDocument.mockReset().mockImplementation(async (id: number) => interviews.find((doc) => doc.id === id) ?? null)
    listCodings.mockReset().mockResolvedValue([])
    listNotes.mockReset().mockResolvedValue([])
    vi.stubGlobal('window', {
      api: {
        documents: { get: getDocument },
        codings: { listByDocument: listCodings },
        notes: { listByDocument: listNotes }
      }
    })
  })

  afterEach(() => {
    unsubscribe?.()
    unsubscribe = undefined
    vi.unstubAllGlobals()
  })

  it.each(['codings', 'notes'])('never exposes the second interview with old codings while %s are loading', async (pending) => {
    const codings = deferred<Coding[]>()
    const notes = deferred<Note[]>()
    listCodings.mockReturnValue(codings.promise)
    listNotes.mockReturnValue(notes.promise)
    const observed: Array<{ documentId: number | undefined; codingDocuments: number[]; noteDocuments: Array<number | null> }> = []
    unsubscribe = useAppStore.subscribe((state) => {
      observed.push({
        documentId: state.currentDocument?.id,
        codingDocuments: state.codings.map((coding) => coding.documentId),
        noteDocuments: state.documentNotes.map((note) => note.documentId)
      })
    })

    const selection = useAppStore.getState().selectDocument(2)
    await vi.waitFor(() => expect(listNotes).toHaveBeenCalledWith(2))
    if (pending === 'codings') notes.resolve([])
    else codings.resolve([])
    await Promise.resolve()

    expect(useAppStore.getState().currentDocument?.id).toBe(1)
    expect(observed).toEqual([])

    codings.resolve([])
    notes.resolve([])
    await selection

    expect(observed).toEqual([{ documentId: 2, codingDocuments: [], noteDocuments: [] }])
    expect(useAppStore.getState()).toMatchObject({ navigateNoteId: null, editorNoteId: null })

    listCodings.mockResolvedValue(firstCodings)
    listNotes.mockResolvedValue(firstNotes)
    await useAppStore.getState().selectDocument(1)
    expect(useAppStore.getState()).toMatchObject({
      currentDocument: interviews[0], codings: firstCodings, documentNotes: firstNotes
    })
  })

  // Antes este caso limpava a tela. A expectativa mudou de propósito: quem apaga
  // um documento é o deleteDocument, e ele já limpa. Chegar aqui com um id morto
  // significa clique em lista desatualizada (a de ocorrências, por exemplo), e
  // nesse caso perder o documento que está aberto é dano colateral — o usuário
  // não pediu para fechar nada. O ponto original do teste continua valendo:
  // nada é carregado à toa e nenhum estado intermediário aparece.
  it('keeps the open interview when the requested document no longer exists', async () => {
    const ok = await useAppStore.getState().selectDocument(99)

    expect(ok).toBe(false)
    expect(useAppStore.getState()).toMatchObject({
      currentDocument: interviews[0], codings: firstCodings, documentNotes: firstNotes
    })
    expect(listCodings).not.toHaveBeenCalled()
    expect(listNotes).not.toHaveBeenCalled()
  })

  it('keeps the current interview consistent if loading its replacement fails', async () => {
    listCodings.mockRejectedValue(new Error('Falha ao carregar códigos'))

    await expect(useAppStore.getState().selectDocument(2)).rejects.toThrow('Falha ao carregar códigos')

    expect(useAppStore.getState()).toMatchObject({
      currentDocument: interviews[0], codings: firstCodings, documentNotes: firstNotes
    })
  })
})
