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

  it('migra um projeto legado completo sem perder código, citação nem coleção', () => {
    const path = join(tempDir, 'completo.liva')
    const raw = new Database!(path)
    povoarLegado(raw)
    raw.close()

    db.openDatabase(path)

    // integridade do arquivo antes de olhar o conteúdo
    expect(db.getRaw().pragma('integrity_check')[0]).toEqual({ integrity_check: 'ok' })
    expect(migrate.getSchemaVersion(db.getRaw())).toBe(migrate.CURRENT_SCHEMA_VERSION)

    const codigos = repos.listCodes()
    expect(codigos.map((c) => c.name)).toEqual(['EMOÇÕES', 'medo'])
    // grupo é derivado: o pai continua pai depois de migrar
    expect(codigos.find((c) => c.name === 'medo')?.parentId).toBe(
      codigos.find((c) => c.name === 'EMOÇÕES')?.id
    )
    // e o contador de uso vem das citações que sobreviveram
    expect(codigos.find((c) => c.name === 'medo')?.usageCount).toBe(2)

    const doc = repos.listDocuments()[0]
    expect(doc.name).toBe('Entrevista')
    expect(repos.listCodingsByDocument(doc.id)).toHaveLength(2)

    const colecoes = repos.listCollections()
    expect(colecoes.map((c) => c.name)).toEqual(['Conceituação'])
    expect(repos.listCollectionMembers(colecoes[0].id)).toEqual([
      codigos.find((c) => c.name === 'EMOÇÕES')?.id
    ])

    // a tabela nova existe e é usável no projeto migrado
    expect(repos.listProjectNotes()).toHaveLength(0)
    repos.createNote({ scope: 'project', body: 'escrita depois de migrar' })
    expect(repos.listProjectNotes()).toHaveLength(1)
    db.closeDatabase()
  })

  // A recusa prometia "não corromper", mas o DDL rodava antes dela: num projeto
  // de um app mais novo, onde uma tabela tivesse sido renomeada, o
  // CREATE TABLE IF NOT EXISTS recriava a antiga, vazia, antes do erro aparecer.
  it('recusa projeto de app mais novo sem escrever no arquivo', () => {
    const path = join(tempDir, 'futuro.liva')
    const raw = new Database!(path)
    raw.pragma('user_version = 99')
    const antes = raw
      .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'")
      .get() as { n: number }

    expect(() => migrate.migrateDatabase(raw)).toThrow(/versão mais nova/i)

    const depois = raw
      .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'")
      .get() as { n: number }
    expect(depois.n).toBe(antes.n)
    raw.close()
  })

  // Carimbar o legado direto no alvo e pular as migrações só funciona enquanto
  // cada uma for um CREATE espelhado no DDL. No primeiro ALTER TABLE, o projeto
  // MAIS ANTIGO seria o único a ficar sem a coluna nova.
  it('roda as migrações pendentes num banco legado, em vez de só carimbar', () => {
    const path = join(tempDir, 'legado.liva')
    const raw = new Database!(path)
    raw.exec(migrateTestDdl())
    expect(migrate.getSchemaVersion(raw)).toBe(0)

    const rodou: number[] = []
    migrate.migrateDatabase(raw, {
      targetVersion: 2,
      migrations: [
        {
          version: 2,
          description: 'de mentira, só para ver se roda',
          up: (db) => {
            rodou.push(2)
            db.exec('CREATE TABLE IF NOT EXISTS prova (id INTEGER PRIMARY KEY)')
          }
        }
      ]
    })

    expect(rodou).toEqual([2])
    expect(migrate.getSchemaVersion(raw)).toBe(2)
    raw.close()
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
    );
    CREATE TABLE codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guid TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#2563eb',
      description TEXT,
      parent_id INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE code_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guid TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE code_group_members (
      group_id INTEGER NOT NULL REFERENCES code_groups(id) ON DELETE CASCADE,
      code_id INTEGER NOT NULL REFERENCES codes(id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, code_id)
    );
    CREATE TABLE codings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guid TEXT NOT NULL UNIQUE,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      code_id INTEGER NOT NULL REFERENCES codes(id) ON DELETE CASCADE,
      start_pos INTEGER NOT NULL,
      end_pos INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE UNIQUE INDEX codings_unique_span
      ON codings (document_id, code_id, start_pos, end_pos);`
  }

  // O que a migração protege é o trabalho de meses da pessoa, e o cenário
  // legado só tinha project_meta e documents: as tabelas de maior risco — e
  // `codings`, com índice único — ficavam sem trava. Aqui o projeto legado vai
  // completo, com grupo (código pai), coleção, membro e duas citações.
  function povoarLegado(raw: InstanceType<NonNullable<typeof Database>>): void {
    raw.exec(migrateTestDdl())
    raw.exec(`
      INSERT INTO project_meta (guid, name, app_version) VALUES ('g-proj', 'Legado', '0.1.0');
      INSERT INTO documents (guid, name, plain_text, original_format, char_count)
        VALUES ('g-doc', 'Entrevista', '0123456789abcdef', 'txt', 16);
      INSERT INTO codes (guid, name, color, sort_order) VALUES ('g-pai', 'EMOÇÕES', '#f00', 0);
      INSERT INTO codes (guid, name, color, parent_id, sort_order)
        VALUES ('g-filho', 'medo', '#0f0', 1, 0);
      INSERT INTO code_groups (guid, name) VALUES ('g-col', 'Conceituação');
      INSERT INTO code_group_members (group_id, code_id) VALUES (1, 1);
      INSERT INTO codings (guid, document_id, code_id, start_pos, end_pos)
        VALUES ('g-cod1', 1, 2, 0, 4);
      INSERT INTO codings (guid, document_id, code_id, start_pos, end_pos)
        VALUES ('g-cod2', 1, 2, 6, 10);
    `)
  }
})
