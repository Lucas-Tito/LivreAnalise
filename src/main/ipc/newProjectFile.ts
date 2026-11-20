import { dialog } from 'electron'
import { mkdtempSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import { openDetachedDatabase, type ProjectDb } from '../db'
import { publishExclusiveFile } from '../services/atomicFile'
import { assertUnusedProjectPath, sanitizeProjectFileName } from '../services/projectPath'

export async function pickNewProjectPath(name: string, defaultPath?: string): Promise<string | null> {
  const safe = sanitizeProjectFileName(name.trim().replace(/\.liva$/i, ''))
  if (!safe || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(safe)) {
    throw new Error('Digite um nome válido para o projeto.')
  }
  const result = await dialog.showOpenDialog({
    title: `Escolher pasta para ${safe}.liva`,
    defaultPath,
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || !result.filePaths[0]) return null
  const path = join(result.filePaths[0], `${safe}.liva`)
  assertUnusedProjectPath(path)
  return path
}

export async function publishNewProject<T>(
  path: string,
  prepare: (db: ProjectDb) => T | Promise<T>
): Promise<T> {
  const staging = mkdtempSync(join(dirname(path), '.livreanalise-projeto-'))
  const source = join(staging, 'projeto.liva')
  try {
    const db = openDetachedDatabase(source)
    let result: T
    try {
      result = await prepare(db)
    } finally {
      db.$client.close()
    }
    assertUnusedProjectPath(path)
    try {
      publishExclusiveFile(source, path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error('Já existe um arquivo nesse destino. Escolha um nome ou uma pasta diferente.')
      }
      throw error
    }
    return result
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
