import { create } from 'zustand'
import type {
  Code,
  Collection,
  CollectionMember,
  CodeWithCount,
  Coding,
  CreateCodeInput,
  CreateCollectionInput,
  CreateGroupInput,
  CreateNoteInput,
  DocumentRecord,
  DocumentWithText,
  Note,
  ProjectMeta,
  RecentProjectWithStats,
  RenameProjectResult,
  UpdateCodeInput,
  UpdateCollectionInput,
  UpdateNoteInput
} from '@shared/types'
import type { HistoryState } from '@shared/ipc'

interface AppState {
  project: ProjectMeta | null
  recents: RecentProjectWithStats[]
  documents: DocumentRecord[]
  currentDocument: DocumentWithText | null
  codes: CodeWithCount[]
  collections: Collection[]
  collectionMembers: CollectionMember[]
  codings: Coding[]
  lastUsedCodeId: number | null
  busy: boolean

  loadRecents: () => Promise<void>
  renameProject: (path: string, name: string) => Promise<RenameProjectResult>
  trashProject: (path: string) => Promise<void>
  bootstrap: () => Promise<void>
  createProject: () => Promise<void>
  openProject: () => Promise<void>
  openRecent: (path: string) => Promise<void>
  importQdpxAsProject: () => Promise<void>
  closeProject: () => Promise<void>

  refreshDocuments: () => Promise<void>
  importDocuments: () => Promise<void>
  selectDocument: (id: number) => Promise<void>
  renameDocument: (id: number, name: string) => Promise<void>
  updateDocumentText: (id: number, text: string) => Promise<void>
  deleteDocument: (id: number) => Promise<void>

  refreshCodes: () => Promise<void>
  createCode: (input: CreateCodeInput) => Promise<Code>
  createGroup: (input: CreateGroupInput) => Promise<Code>
  updateCode: (input: UpdateCodeInput) => Promise<void>
  deleteCode: (id: number) => Promise<void>
  moveCodes: (ids: number[], parentId: number | null) => Promise<void>

  history: HistoryState
  refreshHistory: () => Promise<void>
  undo: () => Promise<string | null>
  redo: () => Promise<string | null>

  refreshCollections: () => Promise<void>
  createCollection: (input: CreateCollectionInput) => Promise<Collection>
  updateCollection: (input: UpdateCollectionInput) => Promise<void>
  deleteCollection: (id: number) => Promise<void>

  refreshCodings: () => Promise<void>
  addCoding: (codeId: number, startPos: number, endPos: number) => Promise<void>
  updateCoding: (id: number, startPos: number, endPos: number) => Promise<void>
  removeCoding: (id: number) => Promise<void>
  setLastUsedCode: (id: number) => void

  notesPanelOpen: boolean
  toggleNotesPanel: () => void
  documentNotes: Note[]
  projectNotes: Note[]
  navigateNoteId: number | null
  navigateToNote: (id: number) => void
  clearNavigateNote: () => void
  editorNoteId: number | null
  openNoteEditor: (id: number | null) => void
  refreshNotes: () => Promise<void>
  createNote: (input: CreateNoteInput) => Promise<Note>
  updateNote: (input: UpdateNoteInput) => Promise<Note>
  deleteNote: (id: number) => Promise<void>
  notesFlush: (() => Promise<void>) | null
  registerNotesFlush: (fn: (() => Promise<void>) | null) => void
}

async function refreshAfterHistory(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void
): Promise<void> {
  await get().refreshDocuments()
  await get().refreshCodes()
  await get().refreshCollections()
  const current = get().currentDocument
  if (current) {
    // Recarrega texto + citações + notas do documento aberto.
    try {
      const doc = await window.api.documents.get(current.id)
      set({ currentDocument: doc })
    } catch {
      set({ currentDocument: null, codings: [] })
    }
    await get().refreshCodings()
  } else {
    set({ codings: [] })
  }
  await get().refreshNotes()
  await get().refreshHistory()
}

async function loadProjectData(set: (partial: Partial<AppState>) => void): Promise<void> {
  const [documents, codes, collections, collectionMembers, projectNotes] =
    await Promise.all([
      window.api.documents.list(),
      window.api.codes.list(),
      window.api.collections.list(),
      window.api.collections.allMembers(),
      window.api.notes.listProject()
    ])
  set({ documents, codes, collections, collectionMembers, projectNotes })
  try {
    set({ history: await window.api.history.state() })
  } catch {
    // sem projeto aberto o histórico não existe
  }
}

function resetNotesState(): Partial<AppState> {
  return {
    documentNotes: [],
    projectNotes: [],
    navigateNoteId: null,
    editorNoteId: null
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  project: null,
  recents: [],
  documents: [],
  currentDocument: null,
  codes: [],
  collections: [],
  collectionMembers: [],
  codings: [],
  lastUsedCodeId: null,
  busy: false,
  notesPanelOpen: false,
  documentNotes: [],
  projectNotes: [],
  navigateNoteId: null,
  editorNoteId: null,
  notesFlush: null,
  history: { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null },

  loadRecents: async () => {
    const recents = await window.api.project.recents()
    set({ recents })
  },

  bootstrap: async () => {
    const project = await window.api.project.current()
    if (project) {
      set({ project })
      await loadProjectData(set)
    }
    await get().loadRecents()
  },

  renameProject: async (path, name) => {
    const result = await window.api.project.rename(path, name)
    await get().loadRecents()
    return result
  },

  trashProject: async (path) => {
    await window.api.project.trash(path)
    await get().loadRecents()
  },

  createProject: async () => {
    const result = await window.api.project.create()
    if (!result) return
    await get().notesFlush?.()
    set({
      project: result.meta,
      currentDocument: null,
      codings: [],
      documents: [],
      codes: [],
      collections: [],
      collectionMembers: [],
      ...resetNotesState()
    })
    await loadProjectData(set)
    await get().loadRecents()
  },

  openProject: async () => {
    const result = await window.api.project.open()
    if (!result) return
    await get().notesFlush?.()
    set({ project: result.meta, currentDocument: null, codings: [], ...resetNotesState() })
    await loadProjectData(set)
    await get().loadRecents()
  },

  openRecent: async (path) => {
    const result = await window.api.project.openPath(path)
    if (!result) return
    await get().notesFlush?.()
    set({ project: result.meta, currentDocument: null, codings: [], ...resetNotesState() })
    await loadProjectData(set)
    await get().loadRecents()
  },

  importQdpxAsProject: async () => {
    const result = await window.api.qdpx.importAsProject()
    if (!result) return
    await get().notesFlush?.()
    set({
      project: result.meta,
      currentDocument: null,
      codings: [],
      documents: [],
      codes: [],
      collections: [],
      collectionMembers: [],
      ...resetNotesState()
    })
    await loadProjectData(set)
    await get().loadRecents()
  },

  closeProject: async () => {
    await get().notesFlush?.()
    await window.api.project.close()
    set({
      project: null,
      documents: [],
      currentDocument: null,
      codes: [],
      collections: [],
      collectionMembers: [],
      codings: [],
      ...resetNotesState()
    })
    await get().loadRecents()
  },

  refreshDocuments: async () => {
    set({ documents: await window.api.documents.list() })
  },

  importDocuments: async () => {
    set({ busy: true })
    try {
      await window.api.documents.import()
      await get().refreshDocuments()
    } finally {
      set({ busy: false })
    }
  },

  selectDocument: async (id) => {
    await get().notesFlush?.()
    const doc = await window.api.documents.get(id)
    set({ currentDocument: doc, navigateNoteId: null, editorNoteId: null })
    if (doc) {
      const [codings, documentNotes] = await Promise.all([
        window.api.codings.listByDocument(doc.id),
        window.api.notes.listByDocument(doc.id)
      ])
      set({ codings, documentNotes })
    } else {
      set({ codings: [], documentNotes: [] })
    }
  },

  renameDocument: async (id, name) => {
    await window.api.documents.rename(id, name)
    await get().refreshDocuments()
    const current = get().currentDocument
    if (current && current.id === id) {
      set({ currentDocument: { ...current, name } })
    }
  },

  updateDocumentText: async (id, text) => {
    await get().notesFlush?.()
    await window.api.documents.updateText(id, text)
    await get().refreshDocuments()
    const current = get().currentDocument
    if (current && current.id === id) {
      await get().selectDocument(id)
    }
    await get().refreshCodes()
    await get().refreshHistory()
  },

  deleteDocument: async (id) => {
    await window.api.documents.delete(id)
    const current = get().currentDocument
    if (current && current.id === id) {
      set({ currentDocument: null, codings: [] })
    }
    await get().refreshDocuments()
    await get().refreshCodes()
    await get().refreshHistory()
  },

  refreshCodes: async () => {
    set({ codes: await window.api.codes.list() })
  },

  createCode: async (input) => {
    const code = await window.api.codes.create(input)
    await get().refreshCodes()
    await get().refreshHistory()
    return code
  },

  createGroup: async (input) => {
    const group = await window.api.codes.createGroup(input)
    await get().refreshCodes()
    await get().refreshHistory()
    return group
  },

  updateCode: async (input) => {
    await window.api.codes.update(input)
    await get().refreshCodes()
    await get().refreshHistory()
  },

  deleteCode: async (id) => {
    await window.api.codes.delete(id)
    await get().refreshCodes()
    await get().refreshCodings()
    await get().refreshHistory()
  },

  moveCodes: async (ids, parentId) => {
    await window.api.codes.moveMany({ ids, parentId })
    await get().refreshCodes()
    await get().refreshHistory()
  },

  refreshHistory: async () => {
    try {
      set({ history: await window.api.history.state() })
    } catch {
      set({ history: { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null } })
    }
  },

  undo: async () => {
    await get().notesFlush?.()
    const label = await window.api.history.undo()
    await refreshAfterHistory(get, set)
    return label
  },

  redo: async () => {
    await get().notesFlush?.()
    const label = await window.api.history.redo()
    await refreshAfterHistory(get, set)
    return label
  },

  refreshCollections: async () => {
    const [collections, collectionMembers] = await Promise.all([
      window.api.collections.list(),
      window.api.collections.allMembers()
    ])
    set({ collections, collectionMembers })
  },

  createCollection: async (input) => {
    const collection = await window.api.collections.create(input)
    await get().refreshCollections()
    await get().refreshHistory()
    return collection
  },

  updateCollection: async (input) => {
    await window.api.collections.update(input)
    await get().refreshCollections()
    await get().refreshHistory()
  },

  deleteCollection: async (id) => {
    await window.api.collections.delete(id)
    await get().refreshCollections()
    await get().refreshHistory()
  },

  refreshCodings: async () => {
    const doc = get().currentDocument
    if (!doc) {
      set({ codings: [] })
      return
    }
    set({ codings: await window.api.codings.listByDocument(doc.id) })
  },

  addCoding: async (codeId, startPos, endPos) => {
    const doc = get().currentDocument
    if (!doc) return
    await window.api.codings.create({ documentId: doc.id, codeId, startPos, endPos })
    set({ lastUsedCodeId: codeId })
    await get().refreshCodings()
    await get().refreshCodes()
    await get().refreshHistory()
  },

  updateCoding: async (id, startPos, endPos) => {
    await window.api.codings.update({ id, startPos, endPos })
    await get().refreshCodings()
    await get().refreshHistory()
  },

  removeCoding: async (id) => {
    await window.api.codings.delete(id)
    await get().refreshCodings()
    await get().refreshCodes()
    await get().refreshHistory()
  },

  setLastUsedCode: (id) => set({ lastUsedCodeId: id }),

  toggleNotesPanel: () => set({ notesPanelOpen: !get().notesPanelOpen }),

  navigateToNote: (id) => set({ navigateNoteId: id, notesPanelOpen: true }),

  clearNavigateNote: () => set({ navigateNoteId: null }),

  openNoteEditor: (id) => set({ editorNoteId: id, notesPanelOpen: true }),

  refreshNotes: async () => {
    const doc = get().currentDocument
    const [documentNotes, projectNotes] = await Promise.all([
      doc ? window.api.notes.listByDocument(doc.id) : Promise.resolve([]),
      window.api.notes.listProject()
    ])
    set({ documentNotes, projectNotes })
  },

  createNote: async (input) => {
    const note = await window.api.notes.create(input)
    await get().refreshNotes()
    await get().refreshHistory()
    return note
  },

  updateNote: async (input) => {
    const note = await window.api.notes.update(input)
    const patch = (list: Note[]): Note[] =>
      list.map((n) => (n.id === note.id ? note : n))
    set({
      documentNotes: patch(get().documentNotes),
      projectNotes: patch(get().projectNotes)
    })
    await get().refreshHistory()
    return note
  },

  deleteNote: async (id) => {
    await window.api.notes.delete(id)
    set({
      documentNotes: get().documentNotes.filter((n) => n.id !== id),
      projectNotes: get().projectNotes.filter((n) => n.id !== id)
    })
    await get().refreshHistory()
  },

  registerNotesFlush: (fn) => set({ notesFlush: fn })
}))
