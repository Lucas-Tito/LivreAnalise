import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { CreateCodeInput, UpdateCodeInput } from '@shared/types'
import {
  createCode,
  deleteCode,
  listCodes,
  updateCode
} from '../db/repositories'

export function registerCodeHandlers(): void {
  ipcMain.handle(IPC.codes.list, async () => listCodes())
  ipcMain.handle(IPC.codes.create, async (_e, input: CreateCodeInput) =>
    createCode(input)
  )
  ipcMain.handle(IPC.codes.update, async (_e, input: UpdateCodeInput) =>
    updateCode(input)
  )
  ipcMain.handle(IPC.codes.delete, async (_e, id: number) => deleteCode(id))
}
