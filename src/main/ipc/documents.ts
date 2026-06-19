import { dialog, ipcMain } from 'electron'
import { basename, extname } from 'path'
import { IPC } from '@shared/ipc'
import type { DocumentRecord } from '@shared/types'
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  renameDocument,
  updateDocumentText
} from '../db/repositories'
import { extractText } from '../services/textExtract'

export function registerDocumentHandlers(): void {
  ipcMain.handle(IPC.documents.list, async () => listDocuments())

  ipcMain.handle(IPC.documents.get, async (_e, id: number) => getDocument(id))

  ipcMain.handle(IPC.documents.import, async (): Promise<DocumentRecord[]> => {
    const result = await dialog.showOpenDialog({
      title: 'Importar documentos',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Documentos', extensions: ['txt', 'docx'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return []
    const created: DocumentRecord[] = []
    for (const filePath of result.filePaths) {
      const extracted = await extractText(filePath)
      const name = basename(filePath, extname(filePath))
      const doc = createDocument({
        name,
        plainText: extracted.text,
        originalFormat: extracted.format,
        sourceFilename: basename(filePath)
      })
      created.push(doc)
    }
    return created
  })

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
