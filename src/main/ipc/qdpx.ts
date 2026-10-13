import { dialog, ipcMain } from 'electron'
import { basename } from 'path'
import { IPC } from '@shared/ipc'
import type { ExportResult, ImportReport, OpenProjectResult } from '@shared/types'
import { getActivePath, getDb, hasActiveProject, openDatabase } from '../db'
import { clearHistoryFor } from '../history/stack'
import { projectMeta } from '../db/schema'
import { pushRecent } from '../services/recents'
import { exportQdpx } from '../qdpx/export'
import { importQdpx } from '../qdpx/import'
import { ensureMeta } from './project'
import { SAVE_DIALOG_PROPERTIES } from './saveDialog'

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
      filters: [{ name: 'REFI-QDA Project', extensions: ['qdpx'] }],
      properties: SAVE_DIALOG_PROPERTIES
    })
    if (result.canceled || !result.filePath) return null
    return exportQdpx(result.filePath, projectName)
  })

}

// Importar um .qdpx sempre cria um projeto novo: pergunta onde salvar o .liva e
// importa para dentro dele. Entra pelo "Abrir projeto", que aceita os dois
// formatos (#41).
export async function importQdpxAsProject(
  qdpxPath: string
): Promise<(OpenProjectResult & { report: ImportReport }) | null> {
  const suggestedName = basename(qdpxPath).replace(/\.qdpx$/i, '')

  const saveResult = await dialog.showSaveDialog({
    title: 'Salvar novo projeto',
    defaultPath: `${suggestedName}.${PROJECT_EXT}`,
    filters: [{ name: 'Projeto LivreAnalise', extensions: [PROJECT_EXT] }],
    properties: SAVE_DIALOG_PROPERTIES
  })
  if (saveResult.canceled || !saveResult.filePath) return null
  const livaPath = saveResult.filePath

  const prev = getActivePath()
  if (prev) clearHistoryFor(prev)
  openDatabase(livaPath)
  const report = await importQdpx(qdpxPath)
  const name = basename(livaPath).replace(/\.liva$/i, '')
  const meta = ensureMeta(name)
  pushRecent(livaPath, meta.name)
  return { meta, path: livaPath, report }
}
