import { createRequire } from 'module'
import { existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shell } from 'electron'
import { renameProject, trashProject } from '../src/main/services/projectFile'

vi.mock('electron', () => ({
  shell: { trashItem: vi.fn() }
}))
vi.mock('../src/main/services/recents', () => ({
  removeRecent: vi.fn(), renameRecent: vi.fn(), replaceRecent: vi.fn()
}))

const require = createRequire(import.meta.url)
let nativeOk = true
try {
  // require sozinho não basta: o dlopen é lazy e só falha no new Database.
  const Database = require('better-sqlite3')
  new Database(':memory:').close()
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

  afterEach(() => {
    db.closeDatabase()
    vi.clearAllMocks()
    rmSync(tempDir, { recursive: true, force: true })
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

  it('preserva commits no WAL enquanto outra conexão está aberta', async () => {
    const other = new Database(projectPath)
    try {
      other.pragma('journal_mode = WAL')
      other.exec("INSERT INTO documents (guid, name, original_format, plain_text) VALUES ('d1', 'D', 'txt', 'confirmado')")
      const wal = projectPath + '-wal'
      expect(existsSync(wal)).toBe(true)
      const attempted = await renameProject(projectPath, 'novo')
      expect(attempted).toMatchObject({ fileRenamed: false, path: projectPath })
      expect(attempted.warning).toContain('todas as instâncias')
      await expect(trashProject(projectPath)).rejects.toThrow('todas as instâncias')
      expect(shell.trashItem).not.toHaveBeenCalled()
      expect(existsSync(wal)).toBe(true)
    } finally {
      other.close()
    }
    const moved = await renameProject(projectPath, 'novo')
    expect(moved.fileRenamed).toBe(true)
    expect(existsSync(projectPath)).toBe(false)
    const reopened = new Database(moved.path, { readonly: true })
    try {
      expect(reopened.prepare('SELECT plain_text FROM documents').get()).toEqual({ plain_text: 'confirmado' })
    } finally {
      reopened.close()
    }
    vi.mocked(shell.trashItem).mockImplementation(async (path) => renameSync(path, join(tempDir, 'lixeira.liva')))
    await trashProject(moved.path)
    expect(existsSync(moved.path)).toBe(false)
    expect(read(join(tempDir, 'lixeira.liva'), 'name')).toBe('novo')
  })

  it('mantém o arquivo original se houver um WAL órfão no destino', async () => {
    const target = join(tempDir, 'novo.liva')
    writeFileSync(target + '-wal', 'arquivo auxiliar')
    await expect(renameProject(projectPath, 'novo')).resolves.toMatchObject({ fileRenamed: false, path: projectPath })
    expect(existsSync(target)).toBe(false)
    expect(read(projectPath, 'name')).toBe('novo')
  })
})
