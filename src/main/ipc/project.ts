import { app, dialog, ipcMain } from 'electron'
import { basename } from 'path'
import { v4 as uuid } from 'uuid'
import { IPC } from '@shared/ipc'
import type { OpenProjectResult, ProjectMeta } from '@shared/types'
import {
  closeDatabase,
  getActivePath,
  getDb,
  hasActiveProject,
  openDatabase
} from '../db'
import { projectMeta } from '../db/schema'
import { pushRecent, readRecents } from '../services/recents'
import { readProjectStats } from '../db/projectStats'

const PROJECT_EXT = 'liva'

function readMeta(): ProjectMeta | null {
  if (!hasActiveProject()) return null
  const db = getDb()
  const row = db.select().from(projectMeta).get()
  if (!row) return null
  return {
    id: row.id,
    guid: row.guid,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    appVersion: row.appVersion
  }
}

function ensureMeta(name: string): ProjectMeta {
  const db = getDb()
  const existing = db.select().from(projectMeta).get()
  if (existing) return readMeta() as ProjectMeta
  db.insert(projectMeta)
    .values({ guid: uuid(), name, appVersion: app.getVersion() })
    .run()
  return readMeta() as ProjectMeta
}

export function registerProjectHandlers(): void {
  ipcMain.handle(IPC.project.create, async (): Promise<OpenProjectResult | null> => {
    const result = await dialog.showSaveDialog({
      title: 'Criar novo projeto',
      defaultPath: `projeto.${PROJECT_EXT}`,
      filters: [{ name: 'Projeto LivreAnalise', extensions: [PROJECT_EXT] }]
    })
    if (result.canceled || !result.filePath) return null
    const path = result.filePath
    openDatabase(path)
    const name = basename(path).replace(/\.liva$/i, '')
    const meta = ensureMeta(name)
    pushRecent(path, meta.name)
    return { meta, path }
  })

  ipcMain.handle(IPC.project.open, async (): Promise<OpenProjectResult | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Abrir projeto',
      properties: ['openFile'],
      filters: [{ name: 'Projeto LivreAnalise', extensions: [PROJECT_EXT] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return openProjectPath(result.filePaths[0])
  })

  ipcMain.handle(
    IPC.project.openPath,
    async (_e, path: string): Promise<OpenProjectResult | null> => {
      return openProjectPath(path)
    }
  )

  ipcMain.handle(IPC.project.current, async (): Promise<ProjectMeta | null> => {
    return readMeta()
  })

  ipcMain.handle(IPC.project.close, async (): Promise<void> => {
    closeDatabase()
  })

  ipcMain.handle(IPC.project.recents, async () => {
    return readRecents().map((recent) => ({
      ...recent,
      stats: readProjectStats(recent.path)
    }))
  })
}

function openProjectPath(path: string): OpenProjectResult | null {
  openDatabase(path)
  const name = basename(path).replace(/\.liva$/i, '')
  const meta = ensureMeta(name)
  pushRecent(getActivePath() as string, meta.name)
  return { meta, path }
}
