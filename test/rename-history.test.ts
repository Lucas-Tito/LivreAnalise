import { afterEach, beforeEach, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from '../src/main/db'
import { createCollection, createDocument, listCollections, listDocuments, renameDocument, updateCollection } from '../src/main/db/repositories'
import { clearAllHistory, historyRedo, historyState, historyUndo } from '../src/main/history/stack'

beforeEach(() => { openDatabase(':memory:'); clearAllHistory() })
afterEach(() => { closeDatabase(); clearAllHistory() })

it('agrupa autosaves de nome do grupo em um passo e refaz o nome mais recente', () => {
  const group = createCollection({ name: 'Original' })
  clearAllHistory()
  updateCollection({ id: group.id, name: 'Intermediário', historyGroup: 'sessão' })
  updateCollection({ id: group.id, name: 'Final', historyGroup: 'sessão' })
  historyUndo()
  expect(listCollections()[0].name).toBe('Original')
  expect(historyState().canUndo).toBe(false)
  historyRedo()
  expect(listCollections()[0].name).toBe('Final')
})

it('separa sessões, memos e grupos distintos', () => {
  const a = createCollection({ name: 'A' })
  const b = createCollection({ name: 'B' })
  clearAllHistory()
  updateCollection({ id: a.id, name: 'A1', historyGroup: 'sessão 1' })
  updateCollection({ id: a.id, name: 'A2', historyGroup: 'sessão 2' })
  updateCollection({ id: a.id, memo: 'Memo', historyGroup: 'sessão 2' })
  updateCollection({ id: b.id, name: 'B1', historyGroup: 'sessão 2' })
  historyUndo()
  expect(listCollections().find((g) => g.id === b.id)?.name).toBe('B')
  historyUndo()
  expect(listCollections().find((g) => g.id === a.id)?.memo).toBe('')
  historyUndo()
  expect(listCollections().find((g) => g.id === a.id)?.name).toBe('A1')
  historyUndo()
  expect(listCollections().find((g) => g.id === a.id)?.name).toBe('A')
  expect(historyState().canUndo).toBe(false)
})

it('agrupa escritas pendentes da renomeação do documento, mas separa novas sessões', () => {
  const doc = createDocument({ name: 'Original', plainText: 'texto', originalFormat: 'txt', sourceFilename: 'd.txt' })
  clearAllHistory()
  renameDocument(doc.id, 'Primeiro', 'sessão 1')
  renameDocument(doc.id, 'Último', 'sessão 1')
  renameDocument(doc.id, 'Outra sessão', 'sessão 2')
  historyUndo()
  expect(listDocuments()[0].name).toBe('Último')
  historyUndo()
  expect(listDocuments()[0].name).toBe('Original')
  expect(historyState().canUndo).toBe(false)
  historyRedo()
  expect(listDocuments()[0].name).toBe('Último')
})
