import { afterEach, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from '../src/main/db'
import { createCode, createCoding, createDocument, listCodingsByCode } from '../src/main/db/repositories'

afterEach(() => closeDatabase())

it('lists exactly the UTF-16 range selected after and including emoji', () => {
  openDatabase(':memory:')
  const doc = createDocument({ name: 'Emoji', plainText: '🙂abc', originalFormat: 'txt' })
  const code = createCode({ name: 'C', color: '#112233' })
  createCoding({ documentId: doc.id, codeId: code.id, startPos: 2, endPos: 5 })
  expect(listCodingsByCode(code.id)[0].text).toBe('abc')
  const other = createCode({ name: 'Emoji', color: '#112233' })
  createCoding({ documentId: doc.id, codeId: other.id, startPos: 0, endPos: 3 })
  expect(listCodingsByCode(other.id)[0].text).toBe('🙂a')
})
