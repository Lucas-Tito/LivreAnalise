import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { getActivePath, getDb, hasActiveProject } from './index'
import { projectMeta } from './schema'
import { sameProjectFile } from '../services/projectPath'

export function usesActiveProjectFile(path: string): boolean {
  const activePath = getActivePath()
  return hasActiveProject() && activePath != null &&
    (activePath === path ||
      (existsSync(activePath) && existsSync(path) && sameProjectFile(activePath, path)))
}

// Sem import de electron de proposito: e o nucleo do renomear, e assim ele
// pode ser testado fora do app.
export function writeProjectName(path: string, name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('O nome do projeto não pode ficar vazio')
  if (!existsSync(path)) throw new Error('Arquivo de projeto não encontrado')

  if (usesActiveProjectFile(path)) {
    getDb().update(projectMeta).set({ name: trimmed }).run()
    return trimmed
  }

  // conexao temporaria, como o readProjectStats faz: o projeto segue fechado
  const raw = new Database(path, { fileMustExist: true, timeout: 0 })
  try {
    raw.prepare('UPDATE project_meta SET name = ?').run(trimmed)
  } finally {
    raw.close()
  }
  return trimmed
}
