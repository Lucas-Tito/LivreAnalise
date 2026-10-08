import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { CreateCodeInput, CreateGroupFromCodesInput, CreateGroupInput, MoveCodesInput, UpdateCodeInput } from '@shared/types'
import {
  createCode,
  createGroupCode,
  createGroupFromCodes,
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
  ipcMain.handle(IPC.codes.createGroup, async (_e, input: CreateGroupInput) =>
    createGroupCode(input.name, input.color, input.codeId)
  )
  ipcMain.handle(
    IPC.codes.createGroupFrom,
    async (_e, input: CreateGroupFromCodesInput) =>
      createGroupFromCodes(input.name, input.color, input.codeIds)
  )
  ipcMain.handle(IPC.codes.update, async (_e, input: UpdateCodeInput) =>
    updateCode(input)
  )
  ipcMain.handle(IPC.codes.delete, async (_e, id: number) => deleteCode(id))
  ipcMain.handle(IPC.codes.moveMany, async (_e, input: MoveCodesInput) =>
    moveCodes(input)
  )
}
