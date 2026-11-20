import Database from 'better-sqlite3'
import { existsSync, linkSync, lstatSync, unlinkSync } from 'fs'
import { shell } from 'electron'
import type { RenameProjectResult } from '@shared/types'
import { usesActiveProjectFile, writeProjectName } from '../db/projectName'
import { removeRecent, renameRecent, replaceRecent } from './recents'
import { assertUnusedProjectPath, sidecarPaths, targetProjectPath } from './projectPath'
import { renameVersionsDir, versionsDir } from './projectVersions'

const IN_USE = 'Feche o projeto em todas as instâncias antes de mover o arquivo.'

function assertUnlinkedProject(path: string): void {
  const file = lstatSync(path, { throwIfNoEntry: false })
  if (!file) throw new Error('Arquivo de projeto não encontrado.')
  if (!file.isFile() || file.nlink !== 1) {
    throw new Error('O arquivo de projeto tem um vínculo no sistema de arquivos.')
  }
}

async function moveClosedProject(path: string, move: () => void | Promise<void>): Promise<void> {
  if (usesActiveProjectFile(path)) throw new Error(IN_USE)
  assertUnlinkedProject(path)
  const raw = new Database(path, { fileMustExist: true, timeout: 0 })
  try {
    // A saída do WAL exige acesso exclusivo e o próprio SQLite consolida
    // os commits. Nunca removemos os arquivos auxiliares manualmente.
    if (raw.pragma('journal_mode = DELETE', { simple: true }) !== 'delete') {
      throw new Error(IN_USE)
    }
    raw.exec('BEGIN EXCLUSIVE')
    if (raw.pragma('journal_mode', { simple: true }) !== 'delete') throw new Error(IN_USE)
    // No Windows o SQLite abre o banco sem FILE_SHARE_DELETE. Feche a
    // conexão limpa antes da movimentação. Outro handle aberto impede o move.
    if (process.platform === 'win32') raw.close()
    if ([...sidecarPaths(path), `${path}-journal`].some((file) => lstatSync(file, { throwIfNoEntry: false }))) {
      throw new Error(IN_USE)
    }
    await move()
  } catch (error) {
    if ((error as { code?: string }).code?.startsWith('SQLITE_BUSY') ||
        (error as { code?: string }).code?.startsWith('SQLITE_LOCKED')) {
      throw new Error(IN_USE, { cause: error })
    }
    throw error
  } finally {
    if (raw.open) raw.close()
  }
}

export async function renameProject(path: string, name: string): Promise<RenameProjectResult> {
  if (!usesActiveProjectFile(path)) assertUnlinkedProject(path)
  const applied = writeProjectName(path, name)

  const target = targetProjectPath(path, applied)
  if (!target) {
    renameRecent(path, applied)
    return { name: applied, path, fileRenamed: false, warning: null }
  }

  if (existsSync(target)) {
    renameRecent(path, applied)
    return {
      name: applied,
      path,
      fileRenamed: false,
      warning: `Já existe um arquivo chamado "${target}". O nome do projeto foi alterado, mas o arquivo continua como estava.`
    }
  }

  if (usesActiveProjectFile(path)) {
    renameRecent(path, applied)
    return {
      name: applied,
      path,
      fileRenamed: false,
      warning:
        'O projeto está aberto: o nome foi alterado, mas o arquivo só pode ser renomeado com ele fechado.'
    }
  }

  try {
    await moveClosedProject(path, () => {
      assertUnusedProjectPath(target)
      if (lstatSync(`${target}-journal`, { throwIfNoEntry: false })) {
        throw new Error('Já existe um arquivo auxiliar do SQLite nesse destino.')
      }
      // Criar o novo vínculo falha de forma exclusiva se o destino surgir
      // após a verificação. O arquivo antigo continua acessível até o unlink.
      linkSync(path, target)
      try {
        unlinkSync(path)
      } catch (error) {
        unlinkSync(target)
        throw error
      }
    })
  } catch (error) {
    renameRecent(path, applied)
    return {
      name: applied,
      path,
      fileRenamed: false,
      warning: `O nome do projeto foi alterado, mas o arquivo não pôde ser renomeado: ${(error as Error).message}`
    }
  }
  renameVersionsDir(path, target)
  replaceRecent(path, target, applied)
  return { name: applied, path: target, fileRenamed: true, warning: null }
}

// Manda para a lixeira do sistema em vez de apagar: um clique errado aqui
// custaria a analise inteira, e a lixeira e recuperavel.
export async function trashProject(path: string): Promise<void> {
  if (!existsSync(path)) {
    removeRecent(path)
    return
  }
  await moveClosedProject(path, () => shell.trashItem(path))
  const dir = versionsDir(path)
  if (existsSync(dir)) {
    try {
      await shell.trashItem(dir)
    } catch {
      // melhor esforço
    }
  }
  removeRecent(path)
}
