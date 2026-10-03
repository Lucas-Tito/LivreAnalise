import { createRequire } from 'module'
import { beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
let nativeOk = true
try {
  require('better-sqlite3')
} catch {
  nativeOk = false
}

describe.skipIf(!nativeOk)('QDPX notes round-trip (integration)', () => {
  let db: typeof import('../src/main/db')
  let repos: typeof import('../src/main/db/repositories')
  let exportMod: typeof import('../src/main/qdpx/export')
  let importMod: typeof import('../src/main/qdpx/import')
  let serialize: typeof import('../src/main/qdpx/serialize')
  let xml: typeof import('../src/main/qdpx/xml')

  beforeEach(async () => {
    db = await import('../src/main/db')
    repos = await import('../src/main/db/repositories')
    exportMod = await import('../src/main/qdpx/export')
    importMod = await import('../src/main/qdpx/import')
    serialize = await import('../src/main/qdpx/serialize')
    xml = await import('../src/main/qdpx/xml')
    db.openDatabase(':memory:')
  })

  it('exports notes in all scopes and re-imports them', async () => {
    const code = repos.createCode({ name: 'C', color: '#111' })
    const doc = repos.createDocument({ name: 'Doc', plainText: '0123456789abcdef', originalFormat: 'txt', sourceFilename: 'd.txt' })
    repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: 0, endPos: 4 })
    repos.createNote({ scope: 'project', title: 'Nível projeto', body: 'corpo projeto' })
    repos.createNote({ scope: 'document', documentId: doc.id, title: 'Nível doc', body: 'corpo doc' })
    repos.createNote({ scope: 'excerpt', documentId: doc.id, startPos: 0, endPos: 4, title: 'No trecho codificado', body: 'corpo trecho' })
    repos.createNote({ scope: 'excerpt', documentId: doc.id, startPos: 6, endPos: 10, title: 'Só nota', body: 'sem código' })

    const { project, warnings } = exportMod.buildProjectFromDb('P')
    expect(project.notes).toHaveLength(4)
    expect(project.projectNoteGuids).toHaveLength(1)
    // Seleção só-nota existe sem Coding.
    const bare = project.documents[0].selections.find((s) => s.codeGuids.length === 0)
    expect(bare).toBeDefined()
    expect(bare!.noteGuids).toHaveLength(1)
    expect(warnings).toHaveLength(0)

    const qde = xml.buildQde(project)
    // Ordem do XSD: Sources < Notes < Sets.
    const iSources = qde.indexOf('<Sources')
    const iNotes = qde.indexOf('<Notes')
    expect(iSources).toBeGreaterThanOrEqual(0)
    expect(iNotes).toBeGreaterThan(iSources)

    const buffer = await serialize.serializeQdpx(project)
    db.openDatabase(':memory:')
    const parsed = await serialize.deserializeQdpx(buffer)
    const report = importMod.importProjectIntoDb(parsed)
    expect(report.notes).toBe(4)

    expect(repos.listProjectNotes()).toHaveLength(1)
    const importedDoc = repos.listDocuments()[0]
    const docNotes = repos.listNotesByDocument(importedDoc.id)
    expect(docNotes).toHaveLength(3)
    expect(docNotes.filter((n) => n.scope === 'excerpt' && n.anchorStatus === 'attached')).toHaveLength(2)
    db.closeDatabase()
  })

  it('demotes detached notes with a warning instead of dropping them', async () => {
    const doc = repos.createDocument({ name: 'Doc', plainText: '0123456789', originalFormat: 'txt', sourceFilename: 'd.txt' })
    const note = repos.createNote({ scope: 'excerpt', documentId: doc.id, startPos: 0, endPos: 4, title: 'T', body: 'B' })
    repos.updateDocumentText(doc.id, 'curto')
    const { project, warnings } = exportMod.buildProjectFromDb('P')
    expect(warnings.length).toBeGreaterThan(0)
    expect(project.notes).toHaveLength(1)

    db.openDatabase(':memory:')
    const report = importMod.importProjectIntoDb({ project, skipped: [] })
    expect(report.notes).toBe(1)
    void note
    db.closeDatabase()
  })

  it('imports a dangling NoteRef as detached instead of throwing', async () => {
    const doc = repos.createDocument({ name: 'Doc', plainText: '0123456789', originalFormat: 'txt', sourceFilename: 'd.txt' })
    void doc
    const project = {
      name: 'P',
      users: [],
      codes: [],
      groups: [],
      documents: [{ guid: 'd1', name: 'D', plainText: '0123456789', selections: [{ guid: 's1', startPosition: 50, endPosition: 60, codeGuids: [], noteGuids: ['n1'] }], noteGuids: [] }],
      notes: [{ guid: 'n1', name: 'Perdida', plainText: 'corpo', description: null }],
      projectNoteGuids: []
    }
    const report = importMod.importProjectIntoDb({ project, skipped: [] })
    expect(report.notes).toBe(1)
    const all = repos.listNotesByDocument(repos.listDocuments()[0].id)
    expect(all[0].anchorStatus).toBe('detached')
    db.closeDatabase()
  })
})
