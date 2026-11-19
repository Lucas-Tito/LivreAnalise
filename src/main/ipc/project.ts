import { CURRENT_SCHEMA_VERSION } from '../db/migrations'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { basename } from 'path'
import { v4 as uuid } from 'uuid'
import { IPC } from '@shared/ipc'
import type {
  ImportReport,
  OpenProjectResult,
  ProjectMeta,
  RenameProjectResult
} from '@shared/types'
import {
  closeDatabase,
  getActivePath,
  getDb,
  hasActiveProject,
  openDatabase,
  type ProjectDb
} from '../db'
import { projectMeta } from '../db/schema'
import { pushRecent, readRecents } from '../services/recents'
import { renameProject, trashProject } from '../services/projectFile'
import { readProjectStats } from '../db/projectStats'
import { clearHistoryFor } from '../history/stack'
import { createVersionSnapshot, projectSchemaVersion, snapshotBeforeMigration, versionsDir } from '../services/projectVersions'
import { pickNewProjectPath, publishNewProject } from './newProjectFile'
import { importQdpxAsProject } from './qdpx'
import { withProjectOperation } from '../services/projectOperation'

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

export function ensureMeta(name: string, db: ProjectDb = getDb()): ProjectMeta {
  const existing = db.select().from(projectMeta).get()
  if (existing) return existing
  return db.insert(projectMeta)
    .values({ guid: uuid(), name, appVersion: app.getVersion() })
    .returning()
    .get()
}

export function registerProjectHandlers(): void {
  ipcMain.handle(IPC.project.create, (_e, name: string) => withProjectOperation(async (): Promise<OpenProjectResult | null> => {
    const path = await pickNewProjectPath(name)
    if (!path) return null
    const meta = await publishNewProject(path, (db) => ensureMeta(basename(path, '.liva'), db))
    const prev = getActivePath()
    openDatabase(path)
    if (prev) clearHistoryFor(prev)
    pushRecent(path, meta.name)
    return { meta, path }
  }))

  ipcMain.handle(IPC.project.pick, () => withProjectOperation(async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Abrir projeto',
      properties: ['openFile'],
      filters: [
        { name: 'Projeto LivreAnalise ou QDPX', extensions: [PROJECT_EXT, 'qdpx'] },
        { name: 'Projeto LivreAnalise', extensions: [PROJECT_EXT] },
        { name: 'REFI-QDA Project', extensions: ['qdpx'] }
      ]
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  }))

  ipcMain.handle(IPC.project.importQdpx, (_e, path: string, name: string) =>
    withProjectOperation((): Promise<(OpenProjectResult & { report: ImportReport }) | null> =>
      importQdpxAsProject(path, name))
  )

  ipcMain.handle(
    IPC.project.openPath,
    (_e, path: string) => withProjectOperation(async (): Promise<OpenProjectResult | null> => {
      return openProjectPath(path)
    })
  )

  ipcMain.handle(IPC.project.current, async (): Promise<ProjectMeta | null> => {
    return readMeta()
  })

  ipcMain.handle(IPC.project.close, () => withProjectOperation(async (): Promise<void> => {
    const path = getActivePath()
    closeDatabase()
    if (path) clearHistoryFor(path)
  }))

  ipcMain.handle(
    IPC.project.rename,
    async (_e, path: string, name: string): Promise<RenameProjectResult> =>
      withProjectOperation(async () => renameProject(path, name))
  )

  ipcMain.handle(IPC.project.trash, async (_e, path: string): Promise<void> => {
    await withProjectOperation(() => trashProject(path))
  })

  ipcMain.handle(IPC.project.recents, async () => {
    return readRecents().map((recent) => ({
      ...recent,
      stats: readProjectStats(recent.path)
    }))
  })
}

export async function prepareProjectMigration(source: string, destination = source): Promise<boolean> {
  const schema = projectSchemaVersion(source)
  if (schema > CURRENT_SCHEMA_VERSION) throw new Error('Projeto de uma versão mais nova. Atualize o LivreAnalise para abri-lo.')
  if (schema === CURRENT_SCHEMA_VERSION) return true
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: 'Atualizar formato do projeto',
    message: 'O projeto precisa ser convertido para abrir nesta versão.',
    detail: `Após a conversão, o LivreAnalise 0.7.x não abrirá o arquivo atualizado. Uma cópia no formato anterior será salva em:\n${versionsDir(destination)}\n\nPara voltar, copie o .liva pré-migração dessa pasta e abra a cópia na versão anterior.`,
    buttons: ['Cancelar', 'Criar cópia e converter'], defaultId: 0, cancelId: 0
  })
  if (response !== 1) return false
  await snapshotBeforeMigration(source, destination)
  return true
}

async function openProjectPath(path: string): Promise<OpenProjectResult | null> {
  const prev = getActivePath()
  if (!(await prepareProjectMigration(path))) return null
  openDatabase(path)
  if (prev) clearHistoryFor(prev)
  const name = basename(path).replace(/\.liva$/i, '')
  const meta = ensureMeta(name)
  pushRecent(getActivePath() as string, meta.name)
  // 1 checkpoint automático por abertura (retenção poda os antigos).
  // Melhor esforço: nunca bloqueia a abertura, mas o erro é registrado.
  await createVersionSnapshot(path, { kind: 'auto', label: null })
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
