import { dialog, ipcMain } from 'electron'
import { basename, extname } from 'path'
import { IPC } from '@shared/ipc'
import type { DocumentRecord } from '@shared/types'
import {
  createDocuments,
  deleteDocument,
  getDocument,
  listDocuments,
  renameDocument,
  updateDocumentText
} from '../db/repositories'
import { extractText } from '../services/textExtract'
import { withProjectOperation } from '../services/projectOperation'
import { getDb } from '../db'

export function registerDocumentHandlers(): void {
  ipcMain.handle(IPC.documents.list, async () => listDocuments())

  ipcMain.handle(IPC.documents.get, async (_e, id: number) => getDocument(id))

  ipcMain.handle(IPC.documents.import, () => withProjectOperation(async (): Promise<DocumentRecord[]> => {
    const target = getDb()
    const result = await dialog.showOpenDialog({
      title: 'Importar documentos',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Documentos', extensions: ['txt', 'docx'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return []
    const inputs: Parameters<typeof createDocuments>[0] = []
    for (const filePath of result.filePaths) {
      const extracted = await extractText(filePath)
      const name = basename(filePath, extname(filePath))
      inputs.push({
        name,
        plainText: extracted.text,
        originalFormat: extracted.format,
        sourceFilename: basename(filePath)
      })
    }
    if (getDb() !== target) throw new Error('O projeto mudou durante a importação. Tente novamente.')
    return createDocuments(inputs)
  }))

  ipcMain.handle(IPC.documents.rename, async (_e, id: number, name: string) => {
    renameDocument(id, name)
  })

  ipcMain.handle(
    IPC.documents.updateText,
    async (_e, id: number, text: string) => {
      updateDocumentText(id, text)
    }
  )

  ipcMain.handle(IPC.documents.delete, async (_e, id: number) => {
    deleteDocument(id)
  })
}
