import { dirname, extname, join } from 'path'

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
