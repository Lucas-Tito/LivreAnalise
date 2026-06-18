import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { CreateGroupInput, UpdateGroupInput } from '@shared/types'
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  listGroupMembers,
  listGroups,
  removeGroupMember,
  updateGroup
} from '../db/repositories'

export function registerGroupHandlers(): void {
  ipcMain.handle(IPC.groups.list, async () => listGroups())
  ipcMain.handle(IPC.groups.create, async (_e, input: CreateGroupInput) =>
    createGroup(input)
  )
  ipcMain.handle(IPC.groups.update, async (_e, input: UpdateGroupInput) =>
    updateGroup(input)
  )
  ipcMain.handle(IPC.groups.delete, async (_e, id: number) => deleteGroup(id))
  ipcMain.handle(IPC.groups.members, async (_e, groupId: number) =>
    listGroupMembers(groupId)
  )
  ipcMain.handle(
    IPC.groups.addMember,
    async (_e, groupId: number, codeId: number) =>
      addGroupMember(groupId, codeId)
  )
  ipcMain.handle(
    IPC.groups.removeMember,
    async (_e, groupId: number, codeId: number) =>
      removeGroupMember(groupId, codeId)
  )
}
