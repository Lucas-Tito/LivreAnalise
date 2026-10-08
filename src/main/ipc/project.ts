import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { basename } from 'path'
import { v4 as uuid } from 'uuid'
import { IPC } from '@shared/ipc'
import type {
  OpenProjectResult,
  ProjectMeta,
  RenameProjectResult
} from '@shared/types'
import {
  closeDatabase,
  getActivePath,
  getDb,
  hasActiveProject,
  openDatabase
} from '../db'
import { projectMeta } from '../db/schema'
import { pushRecent, readRecents } from '../services/recents'
import { renameProject, trashProject } from '../services/projectFile'
import { readProjectStats } from '../db/projectStats'
import { clearHistoryFor } from '../history/stack'
import { createVersionSnapshot, snapshotBeforeMigration } from '../services/projectVersions'

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

export function currentProjectName(): string {
  return readMeta()?.name ?? 'projeto'
}

export function ensureMeta(name: string): ProjectMeta {
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
    // Reabrir = nova sessão: o histórico do projeto anterior não vale mais.
    const prev = getActivePath()
    if (prev) clearHistoryFor(prev)
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
    const path = getActivePath()
    closeDatabase()
    if (path) clearHistoryFor(path)
  })

  ipcMain.handle(
    IPC.project.rename,
    async (_e, path: string, name: string): Promise<RenameProjectResult> =>
      renameProject(path, name)
  )

  ipcMain.handle(IPC.project.trash, async (_e, path: string): Promise<void> => {
    await trashProject(path)
  })

  ipcMain.handle(IPC.project.recents, async () => {
    return readRecents().map((recent) => ({
      ...recent,
      stats: readProjectStats(recent.path)
    }))
  })
}

function openProjectPath(path: string): OpenProjectResult | null {
  const prev = getActivePath()
  if (prev) clearHistoryFor(prev)
  // Antes de abrir (e portanto antes de migrar): so faz copia quando o arquivo
  // esta atrasado. Melhor esforco -- se falhar, a abertura segue, porque
  // recusar abrir o projeto por causa do backup seria pior que nao ter backup.
  try {
    snapshotBeforeMigration(path)
  } catch (err) {
    console.error(`[versoes] copia pre-migracao falhou: ${(err as Error)?.message ?? err}`)
  }
  openDatabase(path)
  const name = basename(path).replace(/\.liva$/i, '')
  const meta = ensureMeta(name)
  pushRecent(getActivePath() as string, meta.name)
  // 1 checkpoint automático por abertura (retenção poda os antigos).
  // Melhor esforço: nunca bloqueia a abertura, mas o erro é registrado.
  createVersionSnapshot(path, { kind: 'auto', label: null })
    .then(() => {
      if (getActivePath() !== path) return
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(IPC.versions.changed)
      }
    })
    .catch((err: unknown) => {
      console.error(`[versoes] checkpoint automático falhou: ${(err as Error)?.message ?? err}`)
    })
  return { meta, path }
}
