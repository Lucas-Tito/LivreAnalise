import { basename, dirname, extname, join, resolve } from 'path'
import { existsSync, realpathSync, statSync } from 'fs'

const PROJECT_EXT = '.liva'

// Caracteres proibidos no Windows, mais controle e pontos/espacos no fim, que o
// Explorer tambem recusa. Nao mexe em acento nem parentese: o nome e do usuario.
const INVALID = /[\\/:*?"<>|\x00-\x1f]/g

export function sanitizeProjectFileName(name: string): string {
  const cleaned = name.replace(INVALID, '-').replace(/[. ]+$/, '').trim()
  return cleaned.slice(0, 120)
}

// Caminho novo: mesma pasta, nome saneado, extensao preservada. Devolve null
// quando o nome nao rende arquivo valido ou quando nada mudaria.
export function targetProjectPath(
  currentPath: string,
  name: string
): string | null {
  const safe = sanitizeProjectFileName(name)
  if (!safe) return null
  const ext = extname(currentPath) || PROJECT_EXT
  const next = join(dirname(currentPath), `${safe}${ext}`)
  return next === currentPath ? null : next
}

// O SQLite em modo WAL deixa os vizinhos -wal e -shm ao lado do arquivo.
export function sidecarPaths(path: string): string[] {
  return [`${path}-wal`, `${path}-shm`]
}

export function canonicalDestination(path: string): string {
  return existsSync(path) ? realpathSync(path) : join(realpathSync(dirname(resolve(path))), basename(path))
}

export function sameProjectFile(a: string, b: string): boolean {
  if (canonicalDestination(a) === canonicalDestination(b)) return true
  if (!existsSync(a) || !existsSync(b)) return false
  const first = statSync(a)
  const second = statSync(b)
  return first.ino !== 0 && first.dev === second.dev && first.ino === second.ino
}
