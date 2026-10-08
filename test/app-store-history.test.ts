import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as db from '../src/main/db'
import * as repos from '../src/main/db/repositories'
import * as history from '../src/main/history/stack'
import { useAppStore } from '../src/renderer/src/stores/appStore'

describe('app store history (integration)', () => {
  beforeEach(() => {
    db.openDatabase(':memory:')
    history.clearAllHistory()
    useAppStore.setState(useAppStore.getInitialState(), true)
    vi.stubGlobal('window', {
      api: {
        documents: {
          list: repos.listDocuments,
          get: repos.getDocument,
          rename: repos.renameDocument,
          import: () => [repos.createDocument({ name: 'Importado', plainText: 'texto', originalFormat: 'txt', sourceFilename: 'd.txt' })]
        },
        codes: { list: repos.listCodes },
        collections: {
          list: repos.listCollections,
          allMembers: repos.listAllCollectionMembers,
          addMember: repos.addCollectionMember,
          removeMember: repos.removeCollectionMember
        },
        notes: { listProject: repos.listProjectNotes, listByDocument: repos.listNotesByDocument },
        history: { state: history.historyState, undo: history.historyUndo, redo: history.historyRedo }
      }
    })
  })

  afterEach(() => {
    db.closeDatabase()
    history.clearAllHistory()
    vi.unstubAllGlobals()
  })

  it('enables undo after importing and updates the label after renaming', async () => {
    await useAppStore.getState().importDocuments()
    expect(useAppStore.getState().history.canUndo).toBe(true)
    const doc = useAppStore.getState().documents[0]
    await useAppStore.getState().renameDocument(doc.id, 'Renomeado')
    expect(useAppStore.getState().history).toEqual(history.historyState())
    await useAppStore.getState().undo()
    expect(useAppStore.getState().documents[0].name).toBe('Importado')
  })

  it('updates both membership and history after adding and removing collection members', async () => {
    const code = repos.createCode({ name: 'Código', color: '#111' })
    const collection = repos.createCollection({ name: 'Coleção' })
    history.clearAllHistory()
    await useAppStore.getState().addCollectionMember(collection.id, code.id)
    expect(useAppStore.getState().collectionMembers).toEqual([{ collectionId: collection.id, codeId: code.id }])
    expect(useAppStore.getState().history).toEqual(history.historyState())
    expect(useAppStore.getState().history.canUndo).toBe(true)
    await useAppStore.getState().removeCollectionMember(collection.id, code.id)
    expect(useAppStore.getState().collectionMembers).toEqual([])
    expect(useAppStore.getState().history).toEqual(history.historyState())
    await useAppStore.getState().undo()
    expect(useAppStore.getState().collectionMembers).toHaveLength(1)
  })

  it('closes the local note draft when undo or redo changes its content', async () => {
    const note = repos.createNote({ scope: 'project', title: 'Antes', body: 'original' })
    history.clearAllHistory()
    repos.updateNote({ id: note.id, title: 'Depois', body: 'editado' })
    await useAppStore.getState().refreshNotes()
    useAppStore.getState().openNoteEditor(note.id)
    await useAppStore.getState().undo()
    expect(useAppStore.getState().projectNotes[0].body).toBe('original')
    expect(useAppStore.getState().editorNoteId).toBeNull()
    useAppStore.getState().openNoteEditor(note.id)
    await useAppStore.getState().redo()
    expect(useAppStore.getState().projectNotes[0].body).toBe('editado')
    expect(useAppStore.getState().editorNoteId).toBeNull()
  })

  it('keeps the editor open when undo does not change the note', async () => {
    const note = repos.createNote({ scope: 'project', body: 'original' })
    await useAppStore.getState().refreshNotes()
    useAppStore.getState().openNoteEditor(note.id)
    repos.createCode({ name: 'Código', color: '#111' })
    await useAppStore.getState().undo()
    expect(useAppStore.getState().editorNoteId).toBe(note.id)
  })
})
