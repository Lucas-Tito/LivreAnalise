import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { getActivePath, getDb, hasActiveProject } from './index'
import { projectMeta } from './schema'

// Sem import de electron de proposito: e o nucleo do renomear, e assim ele
// pode ser testado fora do app.
export function writeProjectName(path: string, name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('O nome do projeto nao pode ficar vazio')
  if (!existsSync(path)) throw new Error('Arquivo de projeto nao encontrado')

  if (hasActiveProject() && getActivePath() === path) {
    getDb().update(projectMeta).set({ name: trimmed }).run()
    return trimmed
  }

  // conexao temporaria, como o readProjectStats faz: o projeto segue fechado
  const raw = new Database(path)
  try {
    raw.prepare('UPDATE project_meta SET name = ?').run(trimmed)
  } finally {
    raw.close()
  }
  return trimmed
}
