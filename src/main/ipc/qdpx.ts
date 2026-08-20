import { dialog, ipcMain } from 'electron'
import { basename } from 'path'
import { IPC } from '@shared/ipc'
import type { ExportResult, OpenProjectResult } from '@shared/types'
import { getDb, hasActiveProject, openDatabase } from '../db'
import { projectMeta } from '../db/schema'
import { pushRecent } from '../services/recents'
import { exportQdpx } from '../qdpx/export'
import { importQdpx } from '../qdpx/import'
import { ensureMeta } from './project'

const PROJECT_EXT = 'liva'

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

  ipcMain.handle(IPC.qdpx.importAsProject, async (): Promise<OpenProjectResult | null> => {
    const openResult = await dialog.showOpenDialog({
      title: 'Selecionar arquivo QDPX',
      properties: ['openFile'],
      filters: [{ name: 'REFI-QDA Project', extensions: ['qdpx'] }]
    })
    if (openResult.canceled || openResult.filePaths.length === 0) return null
    const qdpxPath = openResult.filePaths[0]
    const suggestedName = basename(qdpxPath).replace(/\.qdpx$/i, '')

    const saveResult = await dialog.showSaveDialog({
      title: 'Salvar novo projeto',
      defaultPath: `${suggestedName}.${PROJECT_EXT}`,
      filters: [{ name: 'Projeto LivreAnalise', extensions: [PROJECT_EXT] }]
    })
    if (saveResult.canceled || !saveResult.filePath) return null
    const livaPath = saveResult.filePath

    openDatabase(livaPath)
    await importQdpx(qdpxPath)
    const name = basename(livaPath).replace(/\.liva$/i, '')
    const meta = ensureMeta(name)
    pushRecent(livaPath, meta.name)
    return { meta, path: livaPath }
  })
}
