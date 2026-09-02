import { createRequire } from 'module'
import { existsSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
let nativeOk = true
try {
  require('better-sqlite3')
} catch {
  nativeOk = false
}

// O renomear escreve num projeto fechado, por uma conexao temporaria: e esse
// caminho que nao pode corromper o arquivo nem deixa-lo travado depois.
describe.skipIf(!nativeOk)('writeProjectName', () => {
  let db: typeof import('../src/main/db')
  let writeProjectName: typeof import('../src/main/db/projectName').writeProjectName
  let projectPath = ''
  let tempDir = ''

  beforeEach(async () => {
    db = await import('../src/main/db')
    writeProjectName = (await import('../src/main/db/projectName')).writeProjectName
    tempDir = mkdtempSync(join(tmpdir(), 'atlas-rename-'))
    projectPath = join(tempDir, 'projeto.liva')
    db.openDatabase(projectPath)
    db.getRaw()
      .prepare("INSERT INTO project_meta (guid, name) VALUES ('g1', 'nome antigo')")
      .run()
    db.closeDatabase()
  })

  function read(path: string, column: 'name' | 'guid'): string {
    const raw = new Database(path, { readonly: true })
    try {
      const row = raw.prepare(`SELECT ${column} AS value FROM project_meta`).get() as {
        value: string
      }
      return row.value
    } finally {
      raw.close()
    }
  }

  it('writes the new name into a closed project', () => {
    writeProjectName(projectPath, 'nome novo')
    expect(read(projectPath, 'name')).toBe('nome novo')
  })

  it('leaves the file openable afterwards', () => {
    writeProjectName(projectPath, 'outro nome')
    const reopened = db.openDatabase(projectPath)
    const row = reopened.$client.prepare('SELECT name FROM project_meta').get() as {
      name: string
    }
    db.closeDatabase()
    expect(row.name).toBe('outro nome')
  })

  it('keeps the project guid', () => {
    const before = read(projectPath, 'guid')
    writeProjectName(projectPath, 'terceiro nome')
    expect(read(projectPath, 'guid')).toBe(before)
  })

  it('writes through the active connection when the project is open', () => {
    db.openDatabase(projectPath)
    writeProjectName(projectPath, 'nome com projeto aberto')
    const row = db.getRaw().prepare('SELECT name FROM project_meta').get() as {
      name: string
    }
    db.closeDatabase()
    expect(row.name).toBe('nome com projeto aberto')
  })

  it('trims the name', () => {
    writeProjectName(projectPath, '   com espacos   ')
    expect(read(projectPath, 'name')).toBe('com espacos')
  })

  it('refuses an empty name', () => {
    expect(() => writeProjectName(projectPath, '   ')).toThrow(/vazio/)
    expect(read(projectPath, 'name')).toBe('nome antigo')
  })

  it('refuses a path that does not exist', () => {
    const missing = join(tempDir, 'nao-existe.liva')
    expect(() => writeProjectName(missing, 'qualquer')).toThrow(/não encontrado/)
    expect(existsSync(missing)).toBe(false)
  })
})
