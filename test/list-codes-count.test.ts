import { createRequire } from 'module'
import { beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
let nativeOk = true
try {
  require('better-sqlite3')
} catch {
  nativeOk = false
}

describe.skipIf(!nativeOk)('listCodes usageCount', () => {
  let db: typeof import('../src/main/db')
  let repos: typeof import('../src/main/db/repositories')

  beforeEach(async () => {
    db = await import('../src/main/db')
    repos = await import('../src/main/db/repositories')
    db.openDatabase(':memory:')
  })

  it('returns per-code counts after creating codings', () => {
    const x = repos.createCode({ name: 'X', color: '#f00' })
    const y = repos.createCode({ name: 'Y', color: '#0f0' })
    const doc = repos.createDocument({
      name: 'Doc',
      plainText: 'abc def ghi',
      originalFormat: 'txt'
    })
    repos.createCoding({ documentId: doc.id, codeId: x.id, startPos: 0, endPos: 3 })
    repos.createCoding({ documentId: doc.id, codeId: y.id, startPos: 0, endPos: 3 })
    repos.createCoding({ documentId: doc.id, codeId: y.id, startPos: 4, endPos: 7 })

    const list = repos.listCodes()

    expect(list.map((c) => ({ name: c.name, usageCount: c.usageCount }))).toEqual([
      { name: 'X', usageCount: 1 },
      { name: 'Y', usageCount: 2 }
    ])
  })

  it('counts codings across multiple documents', () => {
    const code = repos.createCode({ name: 'A', color: '#f00' })
    const d1 = repos.createDocument({
      name: 'D1',
      plainText: 'aaa',
      originalFormat: 'txt'
    })
    const d2 = repos.createDocument({
      name: 'D2',
      plainText: 'bbb',
      originalFormat: 'txt'
    })
    repos.createCoding({ documentId: d1.id, codeId: code.id, startPos: 0, endPos: 1 })
    repos.createCoding({ documentId: d2.id, codeId: code.id, startPos: 0, endPos: 1 })

    const listed = repos.listCodes().find((c) => c.name === 'A')!
    expect(listed.usageCount).toBe(2)
  })
})
