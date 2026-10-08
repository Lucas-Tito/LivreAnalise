import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { historyRedo, historyState, historyUndo } from '../history/stack'

export function registerHistoryHandlers(): void {
  ipcMain.handle(IPC.history.state, async () => historyState())
  ipcMain.handle(IPC.history.undo, async () => historyUndo())
  ipcMain.handle(IPC.history.redo, async () => historyRedo())
}
