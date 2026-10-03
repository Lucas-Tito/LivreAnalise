import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type Api } from '@shared/ipc'

const api: Api = {
  project: {
    create: () => ipcRenderer.invoke(IPC.project.create),
    open: () => ipcRenderer.invoke(IPC.project.open),
    openPath: (path) => ipcRenderer.invoke(IPC.project.openPath, path),
    current: () => ipcRenderer.invoke(IPC.project.current),
    close: () => ipcRenderer.invoke(IPC.project.close),
    recents: () => ipcRenderer.invoke(IPC.project.recents),
    rename: (path, name) => ipcRenderer.invoke(IPC.project.rename, path, name),
    trash: (path) => ipcRenderer.invoke(IPC.project.trash, path)
  },
  documents: {
    list: () => ipcRenderer.invoke(IPC.documents.list),
    get: (id) => ipcRenderer.invoke(IPC.documents.get, id),
    import: () => ipcRenderer.invoke(IPC.documents.import),
    rename: (id, name) => ipcRenderer.invoke(IPC.documents.rename, id, name),
    updateText: (id, text) => ipcRenderer.invoke(IPC.documents.updateText, id, text),
    delete: (id) => ipcRenderer.invoke(IPC.documents.delete, id)
  },
  codes: {
    list: () => ipcRenderer.invoke(IPC.codes.list),
    create: (input) => ipcRenderer.invoke(IPC.codes.create, input),
    createGroup: (input) => ipcRenderer.invoke(IPC.codes.createGroup, input),
    update: (input) => ipcRenderer.invoke(IPC.codes.update, input),
    delete: (id) => ipcRenderer.invoke(IPC.codes.delete, id),
    moveMany: (input) => ipcRenderer.invoke(IPC.codes.moveMany, input)
  },
  collections: {
    list: () => ipcRenderer.invoke(IPC.collections.list),
    create: (input) => ipcRenderer.invoke(IPC.collections.create, input),
    update: (input) => ipcRenderer.invoke(IPC.collections.update, input),
    delete: (id) => ipcRenderer.invoke(IPC.collections.delete, id),
    members: (collectionId) =>
      ipcRenderer.invoke(IPC.collections.members, collectionId),
    allMembers: () => ipcRenderer.invoke(IPC.collections.allMembers),
    addMember: (collectionId, codeId) =>
      ipcRenderer.invoke(IPC.collections.addMember, collectionId, codeId),
    removeMember: (collectionId, codeId) =>
      ipcRenderer.invoke(IPC.collections.removeMember, collectionId, codeId)
  },
  codings: {
    listByDocument: (documentId) =>
      ipcRenderer.invoke(IPC.codings.listByDocument, documentId),
    listByCode: (codeId) => ipcRenderer.invoke(IPC.codings.listByCode, codeId),
    create: (input) => ipcRenderer.invoke(IPC.codings.create, input),
    update: (input) => ipcRenderer.invoke(IPC.codings.update, input),
    delete: (id) => ipcRenderer.invoke(IPC.codings.delete, id)
  },
  notes: {
    listByDocument: (documentId) =>
      ipcRenderer.invoke(IPC.notes.listByDocument, documentId),
    listProject: () => ipcRenderer.invoke(IPC.notes.listProject),
    create: (input) => ipcRenderer.invoke(IPC.notes.create, input),
    update: (input) => ipcRenderer.invoke(IPC.notes.update, input),
    delete: (id) => ipcRenderer.invoke(IPC.notes.delete, id)
  },
  transcription: {
    env: () => ipcRenderer.invoke(IPC.transcription.env),
    models: () => ipcRenderer.invoke(IPC.transcription.models),
    modelSize: (modelId) => ipcRenderer.invoke(IPC.transcription.modelSize, modelId),
    pickMedia: () => ipcRenderer.invoke(IPC.transcription.pickMedia),
    downloadModel: (modelId) =>
      ipcRenderer.invoke(IPC.transcription.downloadModel, modelId),
    downloadBinary: () => ipcRenderer.invoke(IPC.transcription.downloadBinary),
    start: (input) => ipcRenderer.invoke(IPC.transcription.start, input),
    cancel: () => ipcRenderer.invoke(IPC.transcription.cancel),
    // primeiro canal de evento empurrado do main para o renderer: progresso
    // continuo nao cabe em invoke/handle
    onEvent: (listener) => {
      const handler = (_e: unknown, event: Parameters<typeof listener>[0]): void =>
        listener(event)
      ipcRenderer.on(IPC.transcription.event, handler)
      return () => ipcRenderer.removeListener(IPC.transcription.event, handler)
    }
  },
  aiExport: {
    export: (scope, documentId) =>
      ipcRenderer.invoke(IPC.aiExport.export, scope, documentId),
    cliInstructions: () => ipcRenderer.invoke(IPC.aiExport.cliInstructions)
  },
  qdpx: {
    export: () => ipcRenderer.invoke(IPC.qdpx.export),
    importAsProject: () => ipcRenderer.invoke(IPC.qdpx.importAsProject)
  },
  history: {
    state: () => ipcRenderer.invoke(IPC.history.state),
    undo: () => ipcRenderer.invoke(IPC.history.undo),
    redo: () => ipcRenderer.invoke(IPC.history.redo)
  },
  versions: {
    list: () => ipcRenderer.invoke(IPC.versions.list),
    create: (label) => ipcRenderer.invoke(IPC.versions.create, label),
    prune: () => ipcRenderer.invoke(IPC.versions.prune),
    restore: (id) => ipcRenderer.invoke(IPC.versions.restore, id)
  },
  view: {
    onAction: (listener) => {
      const handler = (_e: unknown, action: string): void => listener(action)
      ipcRenderer.on(IPC.view.zoomIn, handler)
      ipcRenderer.on(IPC.view.zoomOut, handler)
      ipcRenderer.on(IPC.view.resetZoom, handler)
      ipcRenderer.on(IPC.view.fontSans, handler)
      ipcRenderer.on(IPC.view.fontSerif, handler)
      return () => {
        ipcRenderer.removeListener(IPC.view.zoomIn, handler)
        ipcRenderer.removeListener(IPC.view.zoomOut, handler)
        ipcRenderer.removeListener(IPC.view.resetZoom, handler)
        ipcRenderer.removeListener(IPC.view.fontSans, handler)
        ipcRenderer.removeListener(IPC.view.fontSerif, handler)
      }
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
