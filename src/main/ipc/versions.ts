import { basename, dirname, join, sep } from 'path'
import { dialog, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { getActivePath, openDatabase } from '../db'
import { clearHistoryFor } from '../history/stack'
import { ensureMeta } from './project'
import { pushRecent } from '../services/recents'
import {
  createVersionSnapshot,
  copyVersionTo,
  deleteVersion,
  pruneVersions,
  readManifest,
  resolveVersionFile,
  versionsDir
} from '../services/projectVersions'
import { SAVE_DIALOG_PROPERTIES } from './saveDialog'
import { withProjectOperation } from '../services/projectOperation'
import { canonicalDestination, sameProjectFile } from '../services/projectPath'

function requireActivePath(): string {
  const path = getActivePath()
  if (!path) throw new Error('Nenhum projeto aberto.')
  return path
}

export function registerVersionHandlers(): void {
  ipcMain.handle(IPC.versions.list, async () => readManifest(requireActivePath()))

  ipcMain.handle(IPC.versions.create, (_e, label: string | null) =>
    withProjectOperation(() => createVersionSnapshot(requireActivePath(), { kind: 'manual', label: label ?? null }))
  )

  ipcMain.handle(IPC.versions.prune, () => withProjectOperation(async () => pruneVersions(requireActivePath())))

  // Restaurar sempre como nova cópia: nunca sobrescreve o arquivo aberto.
  // Apagar checkpoint pela interface: a poda automatica so mexe nos
  // automaticos (guarda 10), entao os manuais acumulavam para sempre e cada um
  // e uma copia integral do projeto.
  ipcMain.handle(IPC.versions.delete, (_e, id: string) => withProjectOperation(async () => {
    const activePath = requireActivePath()
    deleteVersion(activePath, id)
    return readManifest(activePath)
  }))

  ipcMain.handle(IPC.versions.restore, (_e, id: string) => withProjectOperation(async () => {
    const activePath = requireActivePath()
    const source = resolveVersionFile(activePath, id)
    if (!source) throw new Error('Versão não encontrada.')
    const result = await dialog.showSaveDialog({
      title: 'Restaurar versão como novo projeto',
      defaultPath: join(dirname(activePath), `${basename(activePath).replace(/\.liva$/i, '')} (versão).liva`),
      filters: [{ name: 'Projeto LivreAnalise', extensions: ['liva'] }],
      properties: SAVE_DIALOG_PROPERTIES
    })
    if (result.canceled || !result.filePath) return null
    // O destino nunca pode ser o próprio projeto aberto: a conexão continua
    // em WAL e o checkpoint sobrescreveria a cópia recém-restaurada.
    const dest = canonicalDestination(result.filePath)
    if (sameProjectFile(result.filePath, activePath)) {
      throw new Error('Escolha outro nome: não é possível restaurar sobre o próprio projeto aberto.')
    }
    // Nem dentro da pasta de versões: destruiria um snapshot vivo.
    const dirPrefix = canonicalDestination(versionsDir(activePath)) + sep
    if (dest.startsWith(dirPrefix)) {
      throw new Error('Escolha outro local: a cópia não pode ficar dentro da pasta de versões.')
    }
    // Preserva a cópia antes do checkpoint, cuja retenção pode podar a origem.
    copyVersionTo(source, result.filePath)
    // Checkpoint do estado atual antes de sair dele. O original nunca é
    // modificado pelo restore, então falha aqui só é registrada.
    await createVersionSnapshot(activePath, { kind: 'auto', label: 'antes de restaurar' }).catch((err: unknown) => {
      console.error(`[versoes] snapshot de segurança falhou: ${(err as Error)?.message ?? err}`)
    })
    clearHistoryFor(activePath)
    openDatabase(result.filePath)
    const meta = ensureMeta(basename(result.filePath).replace(/\.liva$/i, ''))
    pushRecent(result.filePath, meta.name)
    return { meta, path: result.filePath }
  }))
}
