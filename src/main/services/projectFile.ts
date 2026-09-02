import { existsSync, renameSync, rmSync } from 'fs'
import { shell } from 'electron'
import type { RenameProjectResult } from '@shared/types'
import { closeDatabase, getActivePath, hasActiveProject } from '../db'
import { writeProjectName } from '../db/projectName'
import { removeRecent, renameRecent, replaceRecent } from './recents'
import { sidecarPaths, targetProjectPath } from './projectPath'

// O nome de exibicao e gravado primeiro, porque e o que nunca falha. Renomear o
// arquivo vem depois: se der erro (permissao, arquivo em uso, pasta
// sincronizada), o projeto fica com o nome novo por dentro e o arquivo antigo
// no disco -- que e o pior caso possivel, e nao quebra nada.
export function renameProject(path: string, name: string): RenameProjectResult {
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

  if (hasActiveProject() && getActivePath() === path) {
    renameRecent(path, applied)
    return {
      name: applied,
      path,
      fileRenamed: false,
      warning:
        'O projeto esta aberto: o nome foi alterado, mas o arquivo só pode ser renomeado com ele fechado.'
    }
  }

  try {
    renameSync(path, target)
    // os vizinhos do WAL nao acompanham o rename e ficariam orfaos
    for (const sidecar of sidecarPaths(path)) {
      if (existsSync(sidecar)) rmSync(sidecar, { force: true })
    }
    replaceRecent(path, target, applied)
    return { name: applied, path: target, fileRenamed: true, warning: null }
  } catch (error) {
    renameRecent(path, applied)
    return {
      name: applied,
      path,
      fileRenamed: false,
      warning: `O nome do projeto foi alterado, mas o arquivo não pôde ser renomeado: ${(error as Error).message}`
    }
  }
}

// Manda para a lixeira do sistema em vez de apagar: um clique errado aqui
// custaria a analise inteira, e a lixeira e recuperavel.
export async function trashProject(path: string): Promise<void> {
  if (!existsSync(path)) {
    removeRecent(path)
    return
  }
  if (hasActiveProject() && getActivePath() === path) closeDatabase()
  await shell.trashItem(path)
  removeRecent(path)
}
