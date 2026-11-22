import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { closeDatabase, openDatabase } from '../src/main/db'
import { listDocuments } from '../src/main/db/repositories'
import { historyRedo, historyUndo } from '../src/main/history/stack'
import { IPC } from '../src/shared/ipc'
import { registerDocumentHandlers } from '../src/main/ipc/documents'

const { handlers, extract, pick } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(), extract: vi.fn(), pick: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: any) => handlers.set(channel, handler) },
  dialog: { showOpenDialog: pick }
}))
vi.mock('../src/main/services/textExtract', () => ({ extractText: extract }))
beforeEach(() => {
  vi.clearAllMocks()
  openDatabase(':memory:')
  registerDocumentHandlers()
  pick.mockResolvedValue({ filePaths: ['one.txt', 'two.docx'] })
})
afterEach(() => closeDatabase())

it('persists nothing if one of the selected files cannot be extracted', async () => {
  extract.mockResolvedValueOnce({ text: 'one', format: 'txt' }).mockRejectedValueOnce(new Error('DOCX inválido'))
  await expect(handlers.get(IPC.documents.import)!()).rejects.toThrow('DOCX inválido')
  expect(listDocuments()).toEqual([])
})

it('imports and undoes the whole batch in one history entry', async () => {
  extract.mockResolvedValue({ text: 'text', format: 'txt' })
  await handlers.get(IPC.documents.import)!()
  expect(listDocuments()).toHaveLength(2)
  historyUndo()
  expect(listDocuments()).toEqual([])
  historyRedo()
  expect(listDocuments()).toHaveLength(2)
})
