import { afterEach, beforeEach, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from '../src/main/db'
import * as repos from '../src/main/db/repositories'

let documentId: number
let codeId: number
beforeEach(() => {
  openDatabase(':memory:')
  documentId = repos.createDocument({ name: 'D', plainText: '012345', originalFormat: 'txt' }).id
  codeId = repos.createCode({ name: 'C', color: '#112233' }).id
})
afterEach(() => closeDatabase())

it.each([[-1, 3], [2, 2], [3, 2], [0, 7], [0.5, 3], [0, NaN]])('rejects invalid coding range [%s,%s)', (startPos, endPos) => {
  expect(() => repos.createCoding({ documentId, codeId, startPos, endPos })).toThrow('intervalo')
  expect(repos.listCodingsByDocument(documentId)).toEqual([])
})

it('validates both note reattachment and coding adjustment before writing', () => {
  const coding = repos.createCoding({ documentId, codeId, startPos: 1, endPos: 3 })
  expect(() => repos.updateCoding({ id: coding.id, startPos: 1, endPos: 10 })).toThrow('intervalo')
  expect(repos.listCodingsByDocument(documentId)[0]).toEqual(coding)
  const note = repos.createNote({ scope: 'document', documentId })
  expect(() => repos.updateNote({ id: note.id, startPos: 1 })).toThrow('intervalo completo')
  expect(() => repos.updateNote({ id: note.id, startPos: 1, endPos: 10 })).toThrow('intervalo')
  expect(repos.listNotesByDocument(documentId)[0]).toEqual(note)
})

it('does not apply a category as if it were a leaf code', () => {
  repos.createCode({ name: 'Child', color: '#112233', parentId: codeId })
  expect(() => repos.createCoding({ documentId, codeId, startPos: 1, endPos: 3 })).toThrow('Categorias')
})
