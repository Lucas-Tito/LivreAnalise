import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type Api } from '@shared/ipc'

const api: Api = {
  project: {
    create: () => ipcRenderer.invoke(IPC.project.create),
    open: () => ipcRenderer.invoke(IPC.project.open),
    openPath: (path) => ipcRenderer.invoke(IPC.project.openPath, path),
    current: () => ipcRenderer.invoke(IPC.project.current),
    close: () => ipcRenderer.invoke(IPC.project.close),
    recents: () => ipcRenderer.invoke(IPC.project.recents)
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
    update: (input) => ipcRenderer.invoke(IPC.codes.update, input),
    delete: (id) => ipcRenderer.invoke(IPC.codes.delete, id)
  },
  groups: {
    list: () => ipcRenderer.invoke(IPC.groups.list),
    create: (input) => ipcRenderer.invoke(IPC.groups.create, input),
    update: (input) => ipcRenderer.invoke(IPC.groups.update, input),
    delete: (id) => ipcRenderer.invoke(IPC.groups.delete, id),
    members: (groupId) => ipcRenderer.invoke(IPC.groups.members, groupId),
    addMember: (groupId, codeId) =>
      ipcRenderer.invoke(IPC.groups.addMember, groupId, codeId),
    removeMember: (groupId, codeId) =>
      ipcRenderer.invoke(IPC.groups.removeMember, groupId, codeId)
  },
  codings: {
    listByDocument: (documentId) =>
      ipcRenderer.invoke(IPC.codings.listByDocument, documentId),
    listByCode: (codeId) => ipcRenderer.invoke(IPC.codings.listByCode, codeId),
    create: (input) => ipcRenderer.invoke(IPC.codings.create, input),
    update: (input) => ipcRenderer.invoke(IPC.codings.update, input),
    delete: (id) => ipcRenderer.invoke(IPC.codings.delete, id)
  },
  qdpx: {
    export: () => ipcRenderer.invoke(IPC.qdpx.export),
    import: () => ipcRenderer.invoke(IPC.qdpx.import)
  }
}

contextBridge.exposeInMainWorld('api', api)
