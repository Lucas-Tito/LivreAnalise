import { createRequire } from 'module'
import { beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
let nativeOk = true
try {
  require('better-sqlite3')
} catch {
  nativeOk = false
}

describe.skipIf(!nativeOk)('moveCodes (integration)', () => {
  let db: typeof import('../src/main/db')
  let repos: typeof import('../src/main/db/repositories')

  beforeEach(async () => {
    db = await import('../src/main/db')
    repos = await import('../src/main/db/repositories')
    db.openDatabase(':memory:')
  })

  it('moves several codes atomically preserving citations', async () => {
    const group = repos.createCode({ name: 'Grupo', color: '#111' })
    const a = repos.createCode({ name: 'A', color: '#222' })
    const b = repos.createCode({ name: 'B', color: '#333' })
    const doc = repos.createDocument({
      name: 'Doc',
      plainText: 'abcdefghij',
      originalFormat: 'txt',
      sourceFilename: 'd.txt'
    })
    repos.createCoding({ documentId: doc.id, codeId: a.id, startPos: 0, endPos: 4 })

    repos.moveCodes({ ids: [a.id, b.id], parentId: group.id })

    const codes = repos.listCodes()
    expect(codes.find((c) => c.id === a.id)?.parentId).toBe(group.id)
    expect(codes.find((c) => c.id === b.id)?.parentId).toBe(group.id)
    const coding = repos.listCodingsByDocument(doc.id)
    expect(coding).toHaveLength(1)
    expect(coding[0].codeId).toBe(a.id)
    db.closeDatabase()
  })

  it('is atomic: one invalid move aborts the whole batch', async () => {
    const group = repos.createCode({ name: 'Grupo', color: '#111' })
    const child = repos.createCode({ name: 'Filho', color: '#222', parentId: group.id })
    const loose = repos.createCode({ name: 'Solto', color: '#333' })
    // child já é 2º nível: não pode ser destino (criaria 3º nível)
    expect(() => repos.moveCodes({ ids: [loose.id], parentId: child.id })).toThrow()
    const codes = repos.listCodes()
    expect(codes.find((c) => c.id === loose.id)?.parentId).toBeNull()
    db.closeDatabase()
  })

  it('refuses group-into-group', async () => {
    const g1 = repos.createCode({ name: 'G1', color: '#111' })
    repos.createCode({ name: 'F1', color: '#222', parentId: g1.id })
    const g2 = repos.createCode({ name: 'G2', color: '#333' })
    repos.createCode({ name: 'F2', color: '#444', parentId: g2.id })
    expect(() => repos.moveCodes({ ids: [g1.id], parentId: g2.id })).toThrow()
    db.closeDatabase()
  })
})
