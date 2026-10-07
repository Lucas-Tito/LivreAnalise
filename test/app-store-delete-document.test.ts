import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../src/renderer/src/stores/appStore'
import type { DocumentWithText, Note } from '../src/shared/types'

const entrevista: DocumentWithText = {
  id: 1,
  guid: 'document-1',
  name: 'Entrevista 1',
  originalFormat: 'txt',
  sourceFilename: null,
  charCount: 100,
  importedAt: '2026-10-07',
  plainText: 'a'.repeat(100)
}

function nota(id: number, documentId: number | null): Note {
  return {
    id,
    guid: `note-${id}`,
    title: null,
    body: 'corpo',
    scope: documentId == null ? 'project' : 'excerpt',
    documentId,
    startPos: documentId == null ? null : 10,
    endPos: documentId == null ? null : 20,
    anchorStatus: 'attached',
    anchorText: null,
    createdAt: '2026-10-07',
    updatedAt: '2026-10-07'
  }
}

// O cascade do banco apaga as notas junto com o documento, mas o store ficava
// com elas: o contador somava notas inexistentes, a lista mostrava notas
// fantasmas, e o editor podia seguir aberto sobre uma nota que já não existe.
describe('apagar documento', () => {
  const deleteDocument = vi.fn()
  const listDocuments = vi.fn()
  const listNotesByDocument = vi.fn()
  const listProjectNotes = vi.fn()
  const listCodes = vi.fn()
  const historyState = vi.fn()

  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    useAppStore.setState({
      currentDocument: entrevista,
      documentNotes: [nota(1, entrevista.id)],
      projectNotes: [nota(2, null)],
      editorNoteId: 1,
      navigateNoteId: 1
    })
    deleteDocument.mockReset().mockResolvedValue(undefined)
    listDocuments.mockReset().mockResolvedValue([])
    // depois do cascade o documento não tem mais notas
    listNotesByDocument.mockReset().mockResolvedValue([])
    listProjectNotes.mockReset().mockResolvedValue([nota(2, null)])
    listCodes.mockReset().mockResolvedValue([])
    historyState.mockReset().mockResolvedValue({ canUndo: false, canRedo: false })
    vi.stubGlobal('window', {
      api: {
        documents: { delete: deleteDocument, list: listDocuments },
        notes: { listByDocument: listNotesByDocument, listProject: listProjectNotes },
        codes: { list: listCodes },
        history: { state: historyState }
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('não deixa as notas do documento apagado na lista', async () => {
    await useAppStore.getState().deleteDocument(entrevista.id)

    expect(useAppStore.getState().documentNotes).toEqual([])
  })

  it('recarrega as notas do projeto em vez de confiar no estado antigo', async () => {
    await useAppStore.getState().deleteDocument(entrevista.id)

    expect(listProjectNotes).toHaveBeenCalled()
  })

  it('fecha o editor quando a nota aberta era do documento apagado', async () => {
    await useAppStore.getState().deleteDocument(entrevista.id)

    expect(useAppStore.getState().editorNoteId).toBeNull()
    expect(useAppStore.getState().navigateNoteId).toBeNull()
  })

  it('não fecha o editor de uma nota de projeto', async () => {
    useAppStore.setState({ editorNoteId: 2 })

    await useAppStore.getState().deleteDocument(entrevista.id)

    expect(useAppStore.getState().editorNoteId).toBe(2)
  })
})
