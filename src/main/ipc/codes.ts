import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { CreateCodeInput, MoveCodesInput, UpdateCodeInput } from '@shared/types'
import {
  createCode,
  deleteCode,
  listCodes,
  moveCodes,
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
  ipcMain.handle(IPC.codes.moveMany, async (_e, input: MoveCodesInput) =>
    moveCodes(input)
  )
}
