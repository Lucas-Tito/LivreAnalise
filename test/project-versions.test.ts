import { createRequire } from 'module'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
let nativeOk = true
try {
  require('better-sqlite3')
} catch {
  nativeOk = false
}

describe.skipIf(!nativeOk)('project versions (integration)', () => {
  let db: typeof import('../src/main/db')
  let repos: typeof import('../src/main/db/repositories')
  let versions: typeof import('../src/main/services/projectVersions')
  let dir = ''
  let projectPath = ''

  beforeEach(async () => {
    db = await import('../src/main/db')
    repos = await import('../src/main/db/repositories')
    versions = await import('../src/main/services/projectVersions')
    dir = mkdtempSync(join(tmpdir(), 'liva-versions-'))
    projectPath = join(dir, 'estudo.liva')
    db.openDatabase(projectPath)
    repos.createDocument({ name: 'Doc', plainText: 'conteúdo original', originalFormat: 'txt', sourceFilename: 'd.txt' })
  })

  afterEach(() => {
    try {
      db.closeDatabase()
    } catch {
      // ignore
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates a snapshot and restores content from the file', async () => {
    const entry = await versions.createVersionSnapshot(projectPath, { kind: 'manual', label: 'antes da revisão' })
    expect(entry.kind).toBe('manual')
    expect(entry.label).toBe('antes da revisão')

    repos.createDocument({ name: 'Novo', plainText: 'depois', originalFormat: 'txt', sourceFilename: 'n.txt' })
    expect(repos.listDocuments()).toHaveLength(2)

    // A versão é um SQLite válido com o estado do snapshot.
    const Database = require('better-sqlite3')
    const snap = new Database(join(versions.versionsDir(projectPath), entry.file), { readonly: true })
    const docs = snap.prepare('SELECT COUNT(*) AS n FROM documents').get() as { n: number }
    expect(docs.n).toBe(1)
    snap.close()
    db.closeDatabase()
  })

  it('prunes old automatic checkpoints keeping the newest 10', async () => {
    for (let i = 0; i < 12; i++) {
      await versions.createVersionSnapshot(projectPath, { kind: 'auto', label: null })
    }
    const kept = versions.pruneVersions(projectPath)
    expect(kept.filter((e) => e.kind === 'auto')).toHaveLength(10)
    // Manuais nunca são podados.
    await versions.createVersionSnapshot(projectPath, { kind: 'manual', label: 'marco' })
    const kept2 = versions.pruneVersions(projectPath)
    expect(kept2.some((e) => e.label === 'marco')).toBe(true)
    db.closeDatabase()
  })
})
