import { createRequire } from 'module'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  findConnectedCodings,
  spansTouchOrOverlap
} from '../src/main/services/codingMerge'

const require = createRequire(import.meta.url)
let nativeOk = true
try {
  require('better-sqlite3')
} catch {
  nativeOk = false
}

describe('spansTouchOrOverlap', () => {
  it('detects overlap', () => {
    expect(spansTouchOrOverlap(0, 10, 5, 15)).toBe(true)
  })

  it('detects adjacent spans', () => {
    expect(spansTouchOrOverlap(0, 10, 10, 20)).toBe(true)
  })

  it('rejects separate spans', () => {
    expect(spansTouchOrOverlap(0, 10, 11, 20)).toBe(false)
  })
})

describe('findConnectedCodings', () => {
  it('connects a chain of overlapping spans', () => {
    const result = findConnectedCodings(
      [
        { id: 1, startPos: 0, endPos: 10 },
        { id: 2, startPos: 8, endPos: 20 }
      ],
      15,
      25
    )
    expect(result.ids.sort()).toEqual([1, 2])
    expect(result.start).toBe(0)
    expect(result.end).toBe(25)
  })

  it('returns empty when nothing connects', () => {
    expect(
      findConnectedCodings([{ id: 1, startPos: 0, endPos: 5 }], 10, 15)
    ).toEqual({ ids: [], start: 10, end: 15 })
  })
})

describe.skipIf(!nativeOk)('createCoding merge', () => {
  let db: typeof import('../src/main/db')
  let repos: typeof import('../src/main/db/repositories')

  beforeEach(async () => {
    db = await import('../src/main/db')
    repos = await import('../src/main/db/repositories')
    db.openDatabase(':memory:')
  })

  it('merges overlapping selections with the same code', () => {
    const code = repos.createCode({ name: 'Tema', color: '#f00' })
    const doc = repos.createDocument({
      name: 'Doc',
      plainText: 'abcdefghij',
      originalFormat: 'txt'
    })

    repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: 0, endPos: 5 })
    repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: 3, endPos: 8 })

    const list = repos.listCodingsByDocument(doc.id)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ codeId: code.id, startPos: 0, endPos: 8 })
  })

  it('merges adjacent selections with the same code', () => {
    const code = repos.createCode({ name: 'Tema', color: '#f00' })
    const doc = repos.createDocument({
      name: 'Doc',
      plainText: 'abcdefghij',
      originalFormat: 'txt'
    })

    repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: 0, endPos: 5 })
    repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: 5, endPos: 10 })

    const list = repos.listCodingsByDocument(doc.id)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ startPos: 0, endPos: 10 })
  })

  it('keeps separate spans when the same code does not touch', () => {
    const code = repos.createCode({ name: 'Tema', color: '#f00' })
    const doc = repos.createDocument({
      name: 'Doc',
      plainText: 'abcdefghij',
      originalFormat: 'txt'
    })

    repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: 0, endPos: 3 })
    repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: 7, endPos: 10 })

    expect(repos.listCodingsByDocument(doc.id)).toHaveLength(2)
  })

  it('does not merge different codes on the same span', () => {
    const a = repos.createCode({ name: 'A', color: '#f00' })
    const b = repos.createCode({ name: 'B', color: '#0f0' })
    const doc = repos.createDocument({
      name: 'Doc',
      plainText: 'abcdefghij',
      originalFormat: 'txt'
    })

    repos.createCoding({ documentId: doc.id, codeId: a.id, startPos: 0, endPos: 5 })
    repos.createCoding({ documentId: doc.id, codeId: b.id, startPos: 0, endPos: 5 })

    expect(repos.listCodingsByDocument(doc.id)).toHaveLength(2)
  })
})
