import { afterEach, beforeEach, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from '../src/main/db'
import * as repos from '../src/main/db/repositories'
import { applicableCodes, groupDestinations, validateParentChange } from '../src/shared/codeTree'
import { clearAllHistory, historyRedo, historyUndo } from '../src/main/history/stack'

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

it('persists an empty category and keeps it distinct from a code', () => {
  const category = repos.createCode({ name: 'Tema', color: '#112233', isCategory: true })
  const all = repos.listCodes()
  expect(all.find((c) => c.id === category.id)?.isCategory).toBe(true)
  expect(groupDestinations(all).map((c) => c.id)).toContain(category.id)
  expect(applicableCodes(all).map((c) => c.id)).not.toContain(category.id)
  expect(() => repos.createCoding({ documentId, codeId: category.id, startPos: 1, endPos: 3 })).toThrow('Categorias')
  expect(() => validateParentChange(all, category.id, codeId)).toThrow('categoria')
  repos.moveCodes({ ids: [codeId], parentId: category.id })
  repos.moveCodes({ ids: [codeId], parentId: null })
  expect(groupDestinations(repos.listCodes()).map((c) => c.id)).toContain(category.id)
})

it('keeps categories created from codes or by adding a child after they become empty', () => {
  const group = repos.createGroupCode('Categoria', '#112233', codeId)
  repos.moveCodes({ ids: [codeId], parentId: null })
  expect(groupDestinations(repos.listCodes()).map((c) => c.id)).toContain(group.id)

  const parent = repos.createCode({ name: 'Pai', color: '#112233' })
  const child = repos.createCode({ name: 'Filho', color: '#112233', parentId: parent.id })
  repos.deleteCode(child.id)
  expect(groupDestinations(repos.listCodes()).map((c) => c.id)).toContain(parent.id)
})

it('restores the original code type when undoing and redoing conversion to a category', () => {
  const child = repos.createCode({ name: 'Filho', color: '#112233' })
  clearAllHistory()
  repos.moveCodes({ ids: [child.id], parentId: codeId })
  expect(repos.listCodes().find((c) => c.id === codeId)?.isCategory).toBe(true)
  historyUndo()
  expect(repos.listCodes().find((c) => c.id === codeId)?.isCategory).toBe(false)
  historyRedo()
  expect(repos.listCodes().find((c) => c.id === codeId)?.isCategory).toBe(true)
})
