import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { CreateCodingInput } from '@shared/types'
import {
  createCoding,
  deleteCoding,
  listCodingsByCode,
  listCodingsByDocument
} from '../db/repositories'

export function registerCodingHandlers(): void {
  ipcMain.handle(IPC.codings.listByDocument, async (_e, documentId: number) =>
    listCodingsByDocument(documentId)
  )
  ipcMain.handle(IPC.codings.listByCode, async (_e, codeId: number) =>
    listCodingsByCode(codeId)
  )
  ipcMain.handle(IPC.codings.create, async (_e, input: CreateCodingInput) =>
    createCoding(input)
  )
  ipcMain.handle(IPC.codings.delete, async (_e, id: number) => deleteCoding(id))
}
