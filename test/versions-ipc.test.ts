import { createRequire } from 'module'
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../src/shared/ipc'
import * as db from '../src/main/db'
import * as repos from '../src/main/db/repositories'
import { historyState } from '../src/main/history/stack'
import * as versions from '../src/main/services/projectVersions'
import { registerVersionHandlers } from '../src/main/ipc/versions'
import { registerProjectHandlers } from '../src/main/ipc/project'

const { handlers, showSaveDialog, showMessageBox, send } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  showSaveDialog: vi.fn(),
  showMessageBox: vi.fn(async () => ({ response: 1 })),
  send: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getVersion: () => '0.5.0' },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => handlers.set(channel, handler) },
  dialog: { showSaveDialog, showMessageBox },
  BrowserWindow: { getAllWindows: () => [{ webContents: { send } }] }
}))
vi.mock('../src/main/services/recents', () => ({ pushRecent: vi.fn() }))

const require = createRequire(import.meta.url)

describe('versions IPC (integration)', () => {
  let dir = ''
  let projectPath = ''

  beforeEach(() => {
    vi.clearAllMocks()
    handlers.clear()
    registerVersionHandlers()
    registerProjectHandlers()
    dir = mkdtempSync(join(tmpdir(), 'liva-versions-ipc-'))
    projectPath = join(dir, 'estudo.liva')
    db.openDatabase(projectPath)
    repos.createDocument({ name: 'Original', plainText: 'antes', originalFormat: 'txt', sourceFilename: 'd.txt' })
  })

  afterEach(() => {
    db.closeDatabase()
    rmSync(dir, { recursive: true, force: true })
  })

  it('preserves the active project history and destination when restoration fails', async () => {
    const snapshot = await versions.createVersionSnapshot(projectPath)
    const invalid = new (require('better-sqlite3'))(versions.resolveVersionFile(projectPath, snapshot.id)!)
    invalid.exec('DROP TABLE codings; CREATE TABLE codings(id INTEGER PRIMARY KEY)')
    invalid.close()
    const history = historyState()
    const dest = join(dir, 'restaurado.liva')
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: dest })
    await expect(handlers.get(IPC.versions.restore)!(null, snapshot.id)).rejects.toThrow('no such column')
    expect(db.getActivePath()).toBe(projectPath)
    expect(historyState()).toEqual(history)
    expect(existsSync(dest)).toBe(false)
  })

  it('restores the oldest automatic version even when the safety backup prunes it', async () => {
    const first = await versions.createVersionSnapshot(projectPath, { kind: 'auto' })
    repos.createDocument({ name: 'Novo', plainText: 'depois', originalFormat: 'txt', sourceFilename: 'n.txt' })
    for (let i = 1; i < versions.MAX_AUTO_VERSIONS; i++) {
      await versions.createVersionSnapshot(projectPath, { kind: 'auto' })
    }
    const dest = join(dir, 'restaurado.liva')
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: dest })

    const result = await handlers.get(IPC.versions.restore)!(null, first.id)
    expect(result.path).toBe(dest)
    expect(repos.listDocuments().map((d) => d.name)).toEqual(['Original'])
    expect(versions.readManifest(projectPath)).toHaveLength(versions.MAX_AUTO_VERSIONS)
    expect(versions.resolveVersionFile(projectPath, first.id)).toBeNull()

    const Database = require('better-sqlite3')
    const original = new Database(projectPath, { readonly: true })
    expect(original.prepare('SELECT COUNT(*) AS n FROM documents').get()).toEqual({ n: 2 })
    original.close()
  })

  function legacyProject(): string {
    const path = join(dir, 'antigo.liva')
    const Database = require('better-sqlite3')
    const raw = new Database(path)
    raw.exec("CREATE TABLE codes(id INTEGER PRIMARY KEY, guid TEXT, name TEXT, color TEXT, parent_id INTEGER, description TEXT, sort_order INTEGER, created_at TEXT); INSERT INTO codes(id,name) VALUES(1,'Tema'); PRAGMA user_version=2")
    raw.close()
    return path
  }

  it('cancelar antes da conversão preserva o projeto ativo e o schema anterior', async () => {
    const path = legacyProject()
    showMessageBox.mockResolvedValueOnce({ response: 0 })
    expect(await handlers.get(IPC.project.openPath)!(null, path)).toBeNull()
    expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.stringContaining(versions.versionsDir(path)), cancelId: 0, defaultId: 0
    }))
    expect(db.getActivePath()).toBe(projectPath)
    expect(versions.projectSchemaVersion(path)).toBe(2)
    expect(existsSync(versions.versionsDir(path))).toBe(false)
  })

  it('interrompe a conversão se a cópia obrigatória não puder ser criada', async () => {
    const path = legacyProject()
    writeFileSync(versions.versionsDir(path), 'bloqueia a criação da pasta')
    await expect(handlers.get(IPC.project.openPath)!(null, path)).rejects.toThrow()
    expect(db.getActivePath()).toBe(projectPath)
    expect(versions.projectSchemaVersion(path)).toBe(2)
  })

  it('converte depois de confirmar e guarda os dados em uma cópia no schema 2', async () => {
    const path = legacyProject()
    await handlers.get(IPC.project.openPath)!(null, path)
    expect(versions.projectSchemaVersion(path)).toBe(4)
    const entry = versions.readManifest(path).find((entry) => entry.kind === 'premigracao')!
    const backup = versions.resolveVersionFile(path, entry.id)!
    expect(versions.projectSchemaVersion(backup)).toBe(2)
    const Database = require('better-sqlite3')
    const old = new Database(backup, { readonly: true })
    try {
      expect(old.prepare('SELECT name FROM codes').pluck().get()).toBe('Tema')
      expect(old.pragma('table_info(codes)').map((c: { name: string }) => c.name)).not.toContain('memo')
    } finally {
      old.close()
    }
  })

  it('notifies the renderer once the automatic opening checkpoint finishes', async () => {
    await handlers.get(IPC.project.openPath)!(null, projectPath)
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith(IPC.versions.changed))
    expect(versions.readManifest(projectPath)).toHaveLength(1)
  })

  it('leaves the original schema intact when the pre-migration backup fails', async () => {
    db.getRaw().pragma('user_version = 0')
    db.closeDatabase()
    const dir = versions.versionsDir(projectPath)
    mkdirSync(dir)
    const manifest = join(dir, 'manifest.json')
    writeFileSync(manifest, '{truncated')

    await expect(handlers.get(IPC.project.openPath)!(null, projectPath)).rejects.toThrow('catálogo de versões')
    const original = new (require('better-sqlite3'))(projectPath, { readonly: true })
    try {
      expect(original.pragma('user_version', { simple: true })).toBe(0)
      expect(readFileSync(manifest, 'utf8')).toBe('{truncated')
    } finally {
      original.close()
    }
  })

  it('restores committed data from the WAL of a pre-migration snapshot', async () => {
    db.getRaw().pragma('wal_checkpoint(TRUNCATE)')
    db.getRaw().pragma('wal_autocheckpoint = 0')
    repos.createDocument({ name: 'No WAL', plainText: 'preservar', originalFormat: 'txt' })
    db.getRaw().pragma('user_version = 0')
    const snapshot = (await versions.snapshotBeforeMigration(projectPath))!
    expect(snapshot.kind).toBe('premigracao')
    const dest = join(dir, 'com-wal.liva')
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: dest })
    await handlers.get(IPC.versions.restore)!(null, snapshot.id)
    expect(repos.listDocuments().map((d) => d.name)).toEqual(['No WAL', 'Original'])
  })

  it.each(['', '-wal', '-shm'])('refuses a restore when the destination already has %s', async (suffix) => {
    const snapshot = await versions.createVersionSnapshot(projectPath)
    const dest = join(dir, 'outro.liva')
    writeFileSync(dest + suffix, 'dados de outro projeto')
    showSaveDialog.mockResolvedValue({ filePath: dest })
    await expect(handlers.get(IPC.versions.restore)!(null, snapshot.id)).rejects.toThrow('Já existe')
    expect(readFileSync(dest + suffix, 'utf8')).toBe('dados de outro projeto')
    expect(db.getActivePath()).toBe(projectPath)
  })

  it('refuses to overwrite the open project through a hard-link alias', async () => {
    const snapshot = await versions.createVersionSnapshot(projectPath)
    const alias = join(dir, 'alias.liva')
    linkSync(projectPath, alias)
    showSaveDialog.mockResolvedValue({ filePath: alias })
    await expect(handlers.get(IPC.versions.restore)!(null, snapshot.id)).rejects.toThrow('próprio projeto')
    expect(repos.listDocuments()).toHaveLength(1)
  })

  it.skipIf(process.platform === 'win32')('refuses a snapshot destination hidden behind a symlink', async () => {
    const snapshot = await versions.createVersionSnapshot(projectPath)
    const alias = join(dir, 'version-alias')
    symlinkSync(versions.versionsDir(projectPath), alias, 'dir')
    showSaveDialog.mockResolvedValue({ filePath: join(alias, 'new.liva') })
    await expect(handlers.get(IPC.versions.restore)!(null, snapshot.id)).rejects.toThrow('pasta de versões')
  })
})
