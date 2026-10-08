import { createRequire } from 'module'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
let nativeOk = true
let Database: typeof import('better-sqlite3') | null = null
try {
  Database = require('better-sqlite3')
  // require sozinho não basta: o dlopen é lazy e só falha no new Database.
  new Database(':memory:').close()
} catch {
  nativeOk = false
}

describe.skipIf(!nativeOk)('migrações do schema', () => {
  let db: typeof import('../src/main/db')
  let repos: typeof import('../src/main/db/repositories')
  let migrate: typeof import('../src/main/db/migrations')
  let tempDir = ''

  beforeEach(async () => {
    db = await import('../src/main/db')
    repos = await import('../src/main/db/repositories')
    migrate = await import('../src/main/db/migrations')
    tempDir = mkdtempSync(join(tmpdir(), 'atlas-migrate-'))
  })

  afterEach(() => {
    db.closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('carimba a versão do schema em um banco novo', () => {
    db.openDatabase(':memory:')
    expect(migrate.getSchemaVersion(db.getRaw())).toBe(migrate.CURRENT_SCHEMA_VERSION)
  })

  it('preserva os dados de um banco legado sem carimbo', () => {
    const path = join(tempDir, 'legado.liva')
    const raw = new Database!(path)
    raw.exec(migrateTestDdl())
    raw
      .prepare(
        "INSERT INTO project_meta (guid, name, app_version) VALUES ('g-proj', 'Legado', '0.1.0')"
      )
      .run()
    raw
      .prepare(
        "INSERT INTO documents (guid, name, plain_text, original_format, char_count) VALUES ('g-doc', 'Doc', 'conteúdo', 'txt', 8)"
      )
      .run()
    raw.close()

    db.openDatabase(path)

    expect(migrate.getSchemaVersion(db.getRaw())).toBe(migrate.CURRENT_SCHEMA_VERSION)
    const docs = repos.listDocuments()
    expect(docs).toHaveLength(1)
    expect(docs[0].name).toBe('Doc')
    expect(repos.getDocument(docs[0].id)?.plainText).toBe('conteúdo')
  })

  it('reabrir um banco migrado é idempotente', () => {
    const path = join(tempDir, 'reabrir.liva')
    db.openDatabase(path)
    const doc = repos.createDocument({
      name: 'Doc',
      plainText: 'abc',
      originalFormat: 'txt'
    })
    db.closeDatabase()

    db.openDatabase(path)
    expect(migrate.getSchemaVersion(db.getRaw())).toBe(migrate.CURRENT_SCHEMA_VERSION)
    expect(repos.getDocument(doc.id)?.plainText).toBe('abc')

    db.closeDatabase()
    db.openDatabase(path)
    expect(migrate.getSchemaVersion(db.getRaw())).toBe(migrate.CURRENT_SCHEMA_VERSION)
    expect(repos.listDocuments()).toHaveLength(1)
  })

  it('recusa banco criado por um app mais novo', () => {
    const path = join(tempDir, 'novo.liva')
    const raw = new Database!(path)
    raw.exec(migrateTestDdl())
    raw.pragma('user_version = 99')
    raw.close()

    expect(() => db.openDatabase(path)).toThrow(/versão mais nova/)
  })

  it('aplica migrações pendentes em ordem', () => {
    const raw = new Database!(':memory:')
    try {
      raw.exec(migrateTestDdl())
      raw.pragma('user_version = 1')
      const ordem: number[] = []
      migrate.migrateDatabase(raw, {
        targetVersion: 3,
        migrations: [
          {
            version: 2,
            description: 'cria tabela de rascunhos',
            up: (r) => {
              ordem.push(2)
              r.exec('CREATE TABLE scratch_pads (id INTEGER PRIMARY KEY, body TEXT NOT NULL)')
            }
          },
          {
            version: 3,
            description: 'índice dos rascunhos',
            up: (r) => {
              ordem.push(3)
              r.exec('CREATE INDEX scratch_pads_body_idx ON scratch_pads(body)')
            }
          }
        ]
      })
      expect(ordem).toEqual([2, 3])
      expect(migrate.getSchemaVersion(raw)).toBe(3)
      raw.prepare('INSERT INTO scratch_pads (body) VALUES (?)').run('lembrete')
    } finally {
      raw.close()
    }
  })

  it('falha no meio da migração não deixa estado parcial', () => {
    const raw = new Database!(':memory:')
    try {
      raw.exec(migrateTestDdl())
      raw.pragma('user_version = 1')
      expect(() =>
        migrate.migrateDatabase(raw, {
          targetVersion: 3,
          migrations: [
            {
              version: 2,
              description: 'cria tabela de rascunhos',
              up: (r) => {
                r.exec('CREATE TABLE scratch_pads (id INTEGER PRIMARY KEY)')
              }
            },
            {
              version: 3,
              description: 'migração quebrada',
              up: () => {
                throw new Error('coluna inexistente')
              }
            }
          ]
        })
      ).toThrow(/coluna inexistente/)
      expect(migrate.getSchemaVersion(raw)).toBe(1)
      expect(
        raw
          .prepare(
            "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'scratch_pads'"
          )
          .get() as { n: number }
      ).toEqual({ n: 0 })
    } finally {
      raw.close()
    }
  })

  it('recusa registro com versão duplicada', () => {
    const raw = new Database!(':memory:')
    try {
      raw.exec(migrateTestDdl())
      raw.pragma('user_version = 1')
      expect(() =>
        migrate.migrateDatabase(raw, {
          targetVersion: 2,
          migrations: [
            { version: 2, description: 'a', up: () => {} },
            { version: 2, description: 'b', up: () => {} }
          ]
        })
      ).toThrow(/duplicada/)
    } finally {
      raw.close()
    }
  })

  // DDL mínimo com as tabelas usadas nestes testes, sem carimbo de versão:
  // simula o banco criado pelas versões antigas do app.
  function migrateTestDdl(): string {
    return `
    CREATE TABLE project_meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guid TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      app_version TEXT NOT NULL DEFAULT '0.1.0'
    );
    CREATE TABLE documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guid TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      plain_text TEXT NOT NULL,
      original_format TEXT NOT NULL,
      source_filename TEXT,
      char_count INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );`
  }
})
