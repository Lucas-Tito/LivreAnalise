import { randomUUID } from 'crypto'
import { constants, copyFileSync, linkSync, renameSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

function withTemporaryFile<T>(path: string, text: string, mode: number, publish: (tmp: string) => T): T {
  const tmp = join(dirname(path), `.liva-${randomUUID()}.tmp`)
  try {
    writeFileSync(tmp, text, { encoding: 'utf8', flag: 'wx', mode })
    return publish(tmp)
  } finally {
    rmSync(tmp, { force: true })
  }
}

export function writeAtomicFile(path: string, text: string): void {
  withTemporaryFile(path, text, 0o600, (tmp) => renameSync(tmp, path))
}

export function publishExclusiveFile(source: string, dest: string): void {
  try {
    linkSync(source, dest)
  } catch (error) {
    // FAT/exFAT e alguns volumes de rede não têm hard links. Nesses volumes,
    // a cópia exclusiva mantém a garantia essencial: nunca truncar o destino.
    if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
    copyFileSync(source, dest, constants.COPYFILE_EXCL)
  }
}

// O hard link publica apenas o arquivo completo, sem sobrescrever nada, mesmo
// se outra operação escolher o mesmo nome entre a verificação e a escrita.
export function writeUniqueTextFile(path: string, text: string): string {
  return withTemporaryFile(path, text, 0o666, (tmp) => {
    for (let n = 1; ; n++) {
      const candidate = n === 1 ? path : path.replace(/(\.[^./\\]+)?$/, ` (${n})$1`)
      try {
        publishExclusiveFile(tmp, candidate)
        return candidate
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
    }
  })
}
