import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { CreateCollectionInput, UpdateCollectionInput } from '@shared/types'
import {
  addCollectionMember,
  createCollection,
  deleteCollection,
  listAllCollectionMembers,
  listCollectionMembers,
  listCollections,
  removeCollectionMember,
  updateCollection
} from '../db/repositories'

export function registerCollectionHandlers(): void {
  ipcMain.handle(IPC.collections.list, async () => listCollections())
  ipcMain.handle(
    IPC.collections.create,
    async (_e, input: CreateCollectionInput) => createCollection(input)
  )
  ipcMain.handle(
    IPC.collections.update,
    async (_e, input: UpdateCollectionInput) => updateCollection(input)
  )
  ipcMain.handle(IPC.collections.delete, async (_e, id: number) =>
    deleteCollection(id)
  )
  ipcMain.handle(IPC.collections.members, async (_e, collectionId: number) =>
    listCollectionMembers(collectionId)
  )
  ipcMain.handle(IPC.collections.allMembers, async () =>
    listAllCollectionMembers()
  )
  ipcMain.handle(
    IPC.collections.addMember,
    async (_e, collectionId: number, codeId: number) =>
      addCollectionMember(collectionId, codeId)
  )
  ipcMain.handle(
    IPC.collections.removeMember,
    async (_e, collectionId: number, codeId: number) =>
      removeCollectionMember(collectionId, codeId)
  )
}
