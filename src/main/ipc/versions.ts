import { copyFileSync } from 'fs'
import { basename, dirname, join, resolve } from 'path'
import { dialog, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { getActivePath, openDatabase } from '../db'
import { clearHistoryFor } from '../history/stack'
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
      defaultPath: join(dirname(activePath), `${basename(activePath).replace(/\.liva$/i, '')} (versão).liva`),
      filters: [{ name: 'Projeto LivreAnalise', extensions: ['liva'] }]
    })
    if (result.canceled || !result.filePath) return null
    // O destino nunca pode ser o próprio projeto aberto: a conexão continua
    // em WAL e o checkpoint sobrescreveria a cópia recém-restaurada.
    if (resolve(result.filePath) === resolve(activePath)) {
      throw new Error('Escolha outro nome: não é possível restaurar sobre o próprio projeto aberto.')
    }
    // Checkpoint do estado atual antes de sair dele. O original nunca é
    // modificado pelo restore, então falha aqui só é registrada.
    await createVersionSnapshot(activePath, { kind: 'auto', label: 'antes de restaurar' }).catch((err: unknown) => {
      console.error(`[versoes] snapshot de segurança falhou: ${(err as Error)?.message ?? err}`)
    })
    copyFileSync(source, result.filePath)
    clearHistoryFor(activePath)
    openDatabase(result.filePath)
    const meta = ensureMeta(basename(result.filePath).replace(/\.liva$/i, ''))
    pushRecent(result.filePath, meta.name)
    return { meta, path: result.filePath }
  })
}
