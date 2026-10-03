import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { CreateNoteInput, UpdateNoteInput } from '@shared/types'
import {
  createNote,
  deleteNote,
  listNotesByDocument,
  listProjectNotes,
  updateNote
} from '../db/repositories'

export function registerNoteHandlers(): void {
  ipcMain.handle(IPC.notes.listByDocument, async (_e, documentId: number) =>
    listNotesByDocument(documentId)
  )
  ipcMain.handle(IPC.notes.listProject, async () => listProjectNotes())
  ipcMain.handle(IPC.notes.create, async (_e, input: CreateNoteInput) =>
    createNote(input)
  )
  ipcMain.handle(IPC.notes.update, async (_e, input: UpdateNoteInput) =>
    updateNote(input)
  )
  ipcMain.handle(IPC.notes.delete, async (_e, id: number) => deleteNote(id))
}
