import { createRequire } from 'module'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../src/shared/ipc'
import * as db from '../src/main/db'
import * as repos from '../src/main/db/repositories'
import * as versions from '../src/main/services/projectVersions'
import { registerVersionHandlers } from '../src/main/ipc/versions'
import { registerProjectHandlers } from '../src/main/ipc/project'

const { handlers, showSaveDialog, send } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  showSaveDialog: vi.fn(),
  send: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getVersion: () => '0.5.0' },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => handlers.set(channel, handler) },
  dialog: { showSaveDialog },
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

  it('notifies the renderer once the automatic opening checkpoint finishes', async () => {
    await handlers.get(IPC.project.openPath)!(null, projectPath)
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith(IPC.versions.changed))
    expect(versions.readManifest(projectPath)).toHaveLength(1)
  })
})
