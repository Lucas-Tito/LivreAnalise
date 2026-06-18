import { createRequire } from 'module'
import { beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
let nativeOk = true
try {
  require('better-sqlite3')
} catch {
  nativeOk = false
}

describe.skipIf(!nativeOk)('DB + QDPX round-trip (integration)', () => {
  let db: typeof import('../src/main/db')
  let repos: typeof import('../src/main/db/repositories')
  let exportMod: typeof import('../src/main/qdpx/export')
  let importMod: typeof import('../src/main/qdpx/import')
  let serialize: typeof import('../src/main/qdpx/serialize')

  beforeEach(async () => {
    db = await import('../src/main/db')
    repos = await import('../src/main/db/repositories')
    exportMod = await import('../src/main/qdpx/export')
    importMod = await import('../src/main/qdpx/import')
    serialize = await import('../src/main/qdpx/serialize')
  })

  it('exports the database to QDPX and re-imports it preserving data', async () => {
    db.openDatabase(':memory:')

    const parent = repos.createCode({ name: 'Emocoes', color: '#ff0000' })
    const child = repos.createCode({
      name: 'Medo',
      color: '#00ff00',
      parentId: parent.id
    })
    const work = repos.createCode({ name: 'Trabalho', color: '#0000ff' })

    const group = repos.createGroup({ name: 'Fase 1' })
    repos.addGroupMember(group.id, child.id)
    repos.addGroupMember(group.id, work.id)

    const doc = repos.createDocument({
      name: 'Entrevista 1',
      plainText: 'O medo de falar em publico apareceu no trabalho.',
      originalFormat: 'txt',
      sourceFilename: 'e1.txt'
    })
    repos.createCoding({ documentId: doc.id, codeId: child.id, startPos: 0, endPos: 4 })
    repos.createCoding({ documentId: doc.id, codeId: work.id, startPos: 0, endPos: 4 })
    repos.createCoding({ documentId: doc.id, codeId: work.id, startPos: 39, endPos: 47 })

    const { project } = exportMod.buildProjectFromDb('Projeto')
    const buffer = await serialize.serializeQdpx(project)

    db.openDatabase(':memory:')
    const parsed = await serialize.deserializeQdpx(buffer)
    const report = importMod.importProjectIntoDb(parsed)

    expect(report.codes).toBe(3)
    expect(report.groups).toBe(1)
    expect(report.documents).toBe(1)
    expect(report.codings).toBe(3)

    const codes = repos.listCodes()
    expect(codes).toHaveLength(3)
    const medo = codes.find((c) => c.name === 'Medo')!
    const emocoes = codes.find((c) => c.name === 'Emocoes')!
    expect(medo.parentId).toBe(emocoes.id)
    expect(medo.usageCount).toBe(1)

    const importedDoc = repos.listDocuments()[0]
    const full = repos.getDocument(importedDoc.id)!
    expect(full.plainText).toBe('O medo de falar em publico apareceu no trabalho.')

    db.closeDatabase()
  })
})
