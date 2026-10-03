import { copyFileSync } from 'fs'
import { basename } from 'path'
import { dialog, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { getActivePath, openDatabase } from '../db'
import { ensureMeta } from './project'
import { pushRecent } from '../services/recents'
import {
  createVersionSnapshot,
  pruneVersions,
  readManifest,
  resolveVersionFile
} from '../services/projectVersions'

function requireActivePath(): string {
  const path = getActivePath()
  if (!path) throw new Error('Nenhum projeto aberto.')
  return path
}

export function registerVersionHandlers(): void {
  ipcMain.handle(IPC.versions.list, async () => readManifest(requireActivePath()))

  ipcMain.handle(IPC.versions.create, async (_e, label: string | null) =>
    createVersionSnapshot(requireActivePath(), { kind: 'manual', label: label ?? null })
  )

  ipcMain.handle(IPC.versions.prune, async () => pruneVersions(requireActivePath()))

  // Restaurar sempre como nova cópia: nunca sobrescreve o arquivo aberto.
  ipcMain.handle(IPC.versions.restore, async (_e, id: string) => {
    const activePath = requireActivePath()
    const source = resolveVersionFile(activePath, id)
    if (!source) throw new Error('Versão não encontrada.')
    const result = await dialog.showSaveDialog({
      title: 'Restaurar versão como novo projeto',
      defaultPath: `${basename(activePath).replace(/\.liva$/i, '')} (versão).liva`,
      filters: [{ name: 'Projeto LivreAnalise', extensions: ['liva'] }]
    })
    if (result.canceled || !result.filePath) return null
    // Backup de segurança do estado atual antes de sair dele.
    await createVersionSnapshot(activePath, { kind: 'auto', label: 'antes de restaurar' }).catch(() => null)
    copyFileSync(source, result.filePath)
    openDatabase(result.filePath)
    const meta = ensureMeta(basename(result.filePath).replace(/\.liva$/i, ''))
    pushRecent(result.filePath, meta.name)
    return { meta, path: result.filePath }
  })
}
