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

describe.skipIf(!nativeOk)('notas (memos)', () => {
  let db: typeof import('../src/main/db')
  let repos: typeof import('../src/main/db/repositories')
  let migrate: typeof import('../src/main/db/migrations')
  let tempDir = ''

  beforeEach(async () => {
    db = await import('../src/main/db')
    repos = await import('../src/main/db/repositories')
    migrate = await import('../src/main/db/migrations')
    tempDir = mkdtempSync(join(tmpdir(), 'atlas-notes-'))
    db.openDatabase(':memory:')
  })

  afterEach(() => {
    db.closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  function makeDoc(text = 'abcdefghij'): { id: number } {
    return repos.createDocument({ name: 'Doc', plainText: text, originalFormat: 'txt' })
  }

  it('cria notas de projeto, documento e trecho', () => {
    const doc = makeDoc()

    const project = repos.createNote({ scope: 'project', title: 'Tese', body: 'rascunho' })
    expect(project.scope).toBe('project')
    expect(project.documentId).toBeNull()
    expect(project.anchorStatus).toBe('attached')

    const docNote = repos.createNote({ scope: 'document', documentId: doc.id, body: 'impressão geral' })
    expect(docNote.scope).toBe('document')
    expect(docNote.documentId).toBe(doc.id)

    const excerpt = repos.createNote({
      scope: 'excerpt',
      documentId: doc.id,
      startPos: 2,
      endPos: 5,
      body: 'aqui ele se contradiz'
    })
    expect(excerpt.scope).toBe('excerpt')
    expect(excerpt.startPos).toBe(2)
    expect(excerpt.endPos).toBe(5)
  })

  it('recusa âncoras inválidas', () => {
    const doc = makeDoc()

    expect(() =>
      repos.createNote({ scope: 'excerpt', documentId: doc.id, startPos: 5, endPos: 5 })
    ).toThrow(/inválido/)
    expect(() =>
      repos.createNote({ scope: 'excerpt', documentId: doc.id, startPos: 8, endPos: 99 })
    ).toThrow(/inválido/)
    expect(() =>
      repos.createNote({ scope: 'excerpt', documentId: 9999, startPos: 0, endPos: 1 })
    ).toThrow(/não encontrado/)
    expect(() => repos.createNote({ scope: 'document' })).toThrow(/documento/)
    expect(() =>
      repos.createNote({ scope: 'excerpt', documentId: doc.id })
    ).toThrow(/intervalo/)
  })

  it('atualiza título e corpo', () => {
    const note = repos.createNote({ scope: 'project', title: 'T', body: 'antes' })
    const updated = repos.updateNote({ id: note.id, title: 'Depois', body: 'depois' })
    expect(updated.title).toBe('Depois')
    expect(updated.body).toBe('depois')
    expect(updated.updatedAt).not.toBe('')
  })

  it('apaga a nota', () => {
    const note = repos.createNote({ scope: 'project', body: 'x' })
    repos.deleteNote(note.id)
    expect(repos.listProjectNotes()).toHaveLength(0)
  })

  it('lista por documento sem misturar com as do projeto', () => {
    const doc = makeDoc()
    repos.createNote({ scope: 'project', body: 'p' })
    repos.createNote({ scope: 'document', documentId: doc.id, body: 'd' })
    repos.createNote({ scope: 'excerpt', documentId: doc.id, startPos: 0, endPos: 1, body: 'e' })

    expect(repos.listNotesByDocument(doc.id)).toHaveLength(2)
    expect(repos.listProjectNotes()).toHaveLength(1)
  })

  it('reajusta âncoras junto com a edição do texto', () => {
    const doc = makeDoc()
    const before = repos.createNote({
      scope: 'excerpt',
      documentId: doc.id,
      startPos: 8,
      endPos: 10,
      body: 'depois'
    })
    const inside = repos.createNote({
      scope: 'excerpt',
      documentId: doc.id,
      startPos: 0,
      endPos: 10,
      body: 'contém'
    })

    // apaga 'efgh' ([4,8)): o texto vira 'abcdij'
    repos.updateDocumentText(doc.id, 'abcdij')

    const notes = repos.listNotesByDocument(doc.id)
    const afterBefore = notes.find((n) => n.id === before.id)!
    expect([afterBefore.startPos, afterBefore.endPos]).toEqual([4, 6])
    expect(afterBefore.anchorStatus).toBe('attached')
    const afterInside = notes.find((n) => n.id === inside.id)!
    expect([afterInside.startPos, afterInside.endPos]).toEqual([0, 6])
  })

  it('desvincula sem apagar quando a edição invalida a âncora', () => {
    const doc = makeDoc()
    const note = repos.createNote({
      scope: 'excerpt',
      documentId: doc.id,
      startPos: 2,
      endPos: 5,
      title: 'Contradição',
      body: 'codifiquei assim por causa da pergunta anterior'
    })

    // apaga 'efgh' ([4,8)): cruza a borda da âncora [2,5)
    repos.updateDocumentText(doc.id, 'abcdij')

    const notes = repos.listNotesByDocument(doc.id)
    expect(notes).toHaveLength(1)
    const detached = notes[0]
    expect(detached.anchorStatus).toBe('detached')
    expect(detached.body).toBe('codifiquei assim por causa da pergunta anterior')
    expect(detached.title).toBe('Contradição')
    expect(detached.anchorText).toBe('cde')
  })

  it('não reajusta nota já desvinculada', () => {
    const doc = makeDoc()
    const note = repos.createNote({
      scope: 'excerpt',
      documentId: doc.id,
      startPos: 2,
      endPos: 5,
      body: 'x'
    })
    repos.updateDocumentText(doc.id, 'abcdij')
    const once = repos.listNotesByDocument(doc.id)[0]
    expect(once.anchorStatus).toBe('detached')

    repos.updateDocumentText(doc.id, 'abcdij!!')
    const twice = repos.listNotesByDocument(doc.id)[0]
    expect(twice.id).toBe(note.id)
    expect(twice.anchorStatus).toBe('detached')
    expect(twice.body).toBe('x')
  })

  it('apagar o documento leva as notas dele e poupa as do projeto', () => {
    const doc = makeDoc()
    repos.createNote({ scope: 'document', documentId: doc.id, body: 'd' })
    repos.createNote({ scope: 'excerpt', documentId: doc.id, startPos: 0, endPos: 1, body: 'e' })
    repos.createNote({ scope: 'project', body: 'p' })

    repos.deleteDocument(doc.id)

    expect(repos.listProjectNotes()).toHaveLength(1)
  })

  it('migra um banco v1 para v2 preservando os dados', () => {
    const path = join(tempDir, 'v1.liva')
    const raw = new Database!(path)
    try {
      raw.exec(`
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
        INSERT INTO project_meta (guid, name, app_version) VALUES ('g', 'V1', '0.1.0');
        INSERT INTO documents (guid, name, plain_text, original_format, char_count)
          VALUES ('d', 'Doc', 'texto', 'txt', 5);
      `)
      raw.pragma('user_version = 1')
    } finally {
      raw.close()
    }

    db.openDatabase(path)

    expect(migrate.getSchemaVersion(db.getRaw())).toBe(2)
    expect(repos.listDocuments()).toHaveLength(1)
    const note = repos.createNote({
      scope: 'excerpt',
      documentId: repos.listDocuments()[0].id,
      startPos: 0,
      endPos: 2,
      body: 'funciona no banco migrado'
    })
    expect(note.body).toBe('funciona no banco migrado')
  })
})
