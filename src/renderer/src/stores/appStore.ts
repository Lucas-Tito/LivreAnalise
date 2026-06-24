import { create } from 'zustand'
import type {
  Code,
  CodeGroup,
  CodeWithCount,
  Coding,
  CreateCodeInput,
  CreateGroupInput,
  DocumentRecord,
  DocumentWithText,
  ProjectMeta,
  RecentProjectWithStats,
  UpdateCodeInput,
  UpdateGroupInput
} from '@shared/types'

interface AppState {
  project: ProjectMeta | null
  recents: RecentProjectWithStats[]
  documents: DocumentRecord[]
  currentDocument: DocumentWithText | null
  codes: CodeWithCount[]
  groups: CodeGroup[]
  codings: Coding[]
  lastUsedCodeId: number | null
  busy: boolean

  loadRecents: () => Promise<void>
  bootstrap: () => Promise<void>
  createProject: () => Promise<void>
  openProject: () => Promise<void>
  openRecent: (path: string) => Promise<void>
  closeProject: () => Promise<void>

  refreshDocuments: () => Promise<void>
  importDocuments: () => Promise<void>
  selectDocument: (id: number) => Promise<void>
  renameDocument: (id: number, name: string) => Promise<void>
  updateDocumentText: (id: number, text: string) => Promise<void>
  deleteDocument: (id: number) => Promise<void>

  refreshCodes: () => Promise<void>
  createCode: (input: CreateCodeInput) => Promise<Code>
  updateCode: (input: UpdateCodeInput) => Promise<void>
  deleteCode: (id: number) => Promise<void>

  refreshGroups: () => Promise<void>
  createGroup: (input: CreateGroupInput) => Promise<CodeGroup>
  updateGroup: (input: UpdateGroupInput) => Promise<void>
  deleteGroup: (id: number) => Promise<void>

  refreshCodings: () => Promise<void>
  addCoding: (codeId: number, startPos: number, endPos: number) => Promise<void>
  removeCoding: (id: number) => Promise<void>
  setLastUsedCode: (id: number) => void
}

async function loadProjectData(set: (partial: Partial<AppState>) => void): Promise<void> {
  const [documents, codes, groups] = await Promise.all([
    window.api.documents.list(),
    window.api.codes.list(),
    window.api.groups.list()
  ])
  set({ documents, codes, groups })
}

export const useAppStore = create<AppState>((set, get) => ({
  project: null,
  recents: [],
  documents: [],
  currentDocument: null,
  codes: [],
  groups: [],
  codings: [],
  lastUsedCodeId: null,
  busy: false,

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

  createProject: async () => {
    const result = await window.api.project.create()
    if (!result) return
    set({
      project: result.meta,
      currentDocument: null,
      codings: [],
      documents: [],
      codes: [],
      groups: []
    })
    await loadProjectData(set)
    await get().loadRecents()
  },

  openProject: async () => {
    const result = await window.api.project.open()
    if (!result) return
    set({ project: result.meta, currentDocument: null, codings: [] })
    await loadProjectData(set)
    await get().loadRecents()
  },

  openRecent: async (path) => {
    const result = await window.api.project.openPath(path)
    if (!result) return
    set({ project: result.meta, currentDocument: null, codings: [] })
    await loadProjectData(set)
    await get().loadRecents()
  },

  closeProject: async () => {
    await window.api.project.close()
    set({
      project: null,
      documents: [],
      currentDocument: null,
      codes: [],
      groups: [],
      codings: []
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
    const doc = await window.api.documents.get(id)
    set({ currentDocument: doc })
    if (doc) {
      const codings = await window.api.codings.listByDocument(doc.id)
      set({ codings })
    } else {
      set({ codings: [] })
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
    await window.api.documents.updateText(id, text)
    await get().refreshDocuments()
    const current = get().currentDocument
    if (current && current.id === id) {
      await get().selectDocument(id)
    }
    await get().refreshCodes()
  },

  deleteDocument: async (id) => {
    await window.api.documents.delete(id)
    const current = get().currentDocument
    if (current && current.id === id) {
      set({ currentDocument: null, codings: [] })
    }
    await get().refreshDocuments()
    await get().refreshCodes()
  },

  refreshCodes: async () => {
    set({ codes: await window.api.codes.list() })
  },

  createCode: async (input) => {
    const code = await window.api.codes.create(input)
    await get().refreshCodes()
    return code
  },

  updateCode: async (input) => {
    await window.api.codes.update(input)
    await get().refreshCodes()
  },

  deleteCode: async (id) => {
    await window.api.codes.delete(id)
    await get().refreshCodes()
    await get().refreshCodings()
  },

  refreshGroups: async () => {
    set({ groups: await window.api.groups.list() })
  },

  createGroup: async (input) => {
    const group = await window.api.groups.create(input)
    await get().refreshGroups()
    return group
  },

  updateGroup: async (input) => {
    await window.api.groups.update(input)
    await get().refreshGroups()
  },

  deleteGroup: async (id) => {
    await window.api.groups.delete(id)
    await get().refreshGroups()
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
  },

  removeCoding: async (id) => {
    await window.api.codings.delete(id)
    await get().refreshCodings()
    await get().refreshCodes()
  },

  setLastUsedCode: (id) => set({ lastUsedCodeId: id })
}))
