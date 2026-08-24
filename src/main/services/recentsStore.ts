import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { RecentProject } from '@shared/types'

export const MAX_RECENTS = 15

// Ler o que esta guardado e filtrar o que existe sao coisas diferentes. Toda
// mutacao usa a lista crua: filtrar antes de escrever apaga permanentemente
// projetos cujo arquivo esta momentaneamente fora de alcance -- ou que acabou
// de ser renomeado.
export function readStoredRecents(file: string): RecentProject[] {
  try {
    if (!existsSync(file)) return []
    const data = JSON.parse(readFileSync(file, 'utf-8')) as RecentProject[]
    return Array.isArray(data) ? data.filter((r) => r && r.path) : []
  } catch {
    return []
  }
}

export function writeStoredRecents(file: string, list: RecentProject[]): void {
  const dir = dirname(file)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(file, JSON.stringify(list, null, 2), 'utf-8')
}

// O filtro de existencia e so para exibicao.
export function visibleRecents(list: RecentProject[]): RecentProject[] {
  return list.filter((r) => existsSync(r.path))
}

export function pushRecent(
  file: string,
  path: string,
  name: string,
  now = new Date().toISOString()
): void {
  const rest = readStoredRecents(file).filter((r) => r.path !== path)
  writeStoredRecents(
    file,
    [{ path, name, lastOpenedAt: now }, ...rest].slice(0, MAX_RECENTS)
  )
}

export function removeRecent(file: string, path: string): void {
  writeStoredRecents(
    file,
    readStoredRecents(file).filter((r) => r.path !== path)
  )
}

export function renameRecent(file: string, path: string, name: string): void {
  writeStoredRecents(
    file,
    readStoredRecents(file).map((r) => (r.path === path ? { ...r, name } : r))
  )
}

export function replaceRecent(
  file: string,
  oldPath: string,
  newPath: string,
  name: string
): void {
  writeStoredRecents(
    file,
    readStoredRecents(file).map((r) =>
      r.path === oldPath ? { ...r, path: newPath, name } : r
    )
  )
}
