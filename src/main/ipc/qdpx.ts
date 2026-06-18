import { dialog, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { ExportResult, ImportReport } from '@shared/types'
import { getDb, hasActiveProject } from '../db'
import { projectMeta } from '../db/schema'
import { exportQdpx } from '../qdpx/export'
import { importQdpx } from '../qdpx/import'

export function registerQdpxHandlers(): void {
  ipcMain.handle(IPC.qdpx.export, async (): Promise<ExportResult | null> => {
    if (!hasActiveProject()) throw new Error('Nenhum projeto aberto')
    const db = getDb()
    const meta = db.select().from(projectMeta).get()
    const projectName = meta?.name ?? 'projeto'
    const result = await dialog.showSaveDialog({
      title: 'Exportar para QDPX',
      defaultPath: `${projectName}.qdpx`,
      filters: [{ name: 'REFI-QDA Project', extensions: ['qdpx'] }]
    })
    if (result.canceled || !result.filePath) return null
    return exportQdpx(result.filePath, projectName)
  })

  ipcMain.handle(IPC.qdpx.import, async (): Promise<ImportReport | null> => {
    if (!hasActiveProject()) throw new Error('Nenhum projeto aberto')
    const result = await dialog.showOpenDialog({
      title: 'Importar arquivo QDPX',
      properties: ['openFile'],
      filters: [{ name: 'REFI-QDA Project', extensions: ['qdpx'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return importQdpx(result.filePaths[0])
  })
}
