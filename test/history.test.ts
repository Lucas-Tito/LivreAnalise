import { createRequire } from 'module'
import { beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
let nativeOk = true
try {
  // require sozinho não basta: o dlopen é lazy e só falha no new Database.
  const Database = require('better-sqlite3')
  new Database(':memory:').close()
} catch {
  nativeOk = false
}

describe.skipIf(!nativeOk)('history undo/redo (integration)', () => {
  let db: typeof import('../src/main/db')
  let repos: typeof import('../src/main/db/repositories')
  let history: typeof import('../src/main/history/stack')

  beforeEach(async () => {
    db = await import('../src/main/db')
    repos = await import('../src/main/db/repositories')
    history = await import('../src/main/history/stack')
    history.clearAllHistory()
    db.openDatabase(':memory:')
  })

  it('restores merged coding siblings exactly', async () => {
    const code = repos.createCode({ name: 'C', color: '#111' })
    const doc = repos.createDocument({ name: 'D', plainText: 'abcdefghij', originalFormat: 'txt', sourceFilename: 'd.txt' })
    history.clearAllHistory()
    const first = repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: 0, endPos: 4 })
    history.clearAllHistory()
    // Toca o primeiro intervalo: merge expande e apaga o segundo implícito.
    repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: 2, endPos: 8 })
    let list = repos.listCodingsByDocument(doc.id)
    expect(list).toHaveLength(1)
    expect(list[0].startPos).toBe(0)
    expect(list[0].endPos).toBe(8)

    history.historyUndo()
    list = repos.listCodingsByDocument(doc.id)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(first.id)
    expect([list[0].startPos, list[0].endPos]).toEqual([0, 4])

    history.historyRedo()
    list = repos.listCodingsByDocument(doc.id)
    expect(list).toHaveLength(1)
    expect([list[0].startPos, list[0].endPos]).toEqual([0, 8])
    db.closeDatabase()
  })

  it('restores code subtree with codings and memberships', async () => {
    const group = repos.createCode({ name: 'G', color: '#111' })
    const child = repos.createCode({ name: 'F', color: '#222', parentId: group.id })
    const col = repos.createCollection({ name: 'Col' })
    repos.addCollectionMember(col.id, child.id)
    const doc = repos.createDocument({ name: 'D', plainText: 'abcdefghij', originalFormat: 'txt', sourceFilename: 'd.txt' })
    repos.createCoding({ documentId: doc.id, codeId: child.id, startPos: 0, endPos: 3 })
    history.clearAllHistory()

    repos.deleteCode(group.id)
    expect(repos.listCodes()).toHaveLength(0)
    expect(repos.listCodingsByDocument(doc.id)).toHaveLength(0)

    history.historyUndo()
    const codes = repos.listCodes()
    expect(codes).toHaveLength(2)
    expect(codes.find((c) => c.id === child.id)?.parentId).toBe(group.id)
    expect(repos.listCodingsByDocument(doc.id)).toHaveLength(1)
    expect(repos.listAllCollectionMembers()).toHaveLength(1)

    history.historyRedo()
    expect(repos.listCodes()).toHaveLength(0)
    db.closeDatabase()
  })

  it('restores exact text, codings and detached notes', async () => {
    const code = repos.createCode({ name: 'C', color: '#111' })
    const doc = repos.createDocument({ name: 'D', plainText: 'hello world', originalFormat: 'txt', sourceFilename: 'd.txt' })
    repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: 0, endPos: 5 })
    repos.createNote({ scope: 'excerpt', documentId: doc.id, startPos: 6, endPos: 11, body: 'nota' })
    history.clearAllHistory()

    repos.updateDocumentText(doc.id, 'hi')
    expect(repos.getDocument(doc.id)?.plainText).toBe('hi')
    expect(repos.listCodingsByDocument(doc.id)).toHaveLength(0)

    history.historyUndo()
    expect(repos.getDocument(doc.id)?.plainText).toBe('hello world')
    expect(repos.listCodingsByDocument(doc.id)).toHaveLength(1)
    const notes = repos.listNotesByDocument(doc.id)
    expect(notes).toHaveLength(1)
    expect(notes[0].anchorStatus).toBe('attached')
    db.closeDatabase()
  })

  it('undoes compound group creation as one step', async () => {
    const solo = repos.createCode({ name: 'Solo', color: '#111' })
    history.clearAllHistory()
    repos.createGroupCode('Grupo', '#222', solo.id)
    expect(repos.listCodes()).toHaveLength(2)
    history.historyUndo()
    const codes = repos.listCodes()
    expect(codes).toHaveLength(1)
    expect(codes[0].parentId).toBeNull()
    db.closeDatabase()
  })

  it('restores the original root order when undoing single-code grouping', () => {
    const roots = ['A', 'B', 'C'].map((name) => repos.createCode({ name, color: '#111' }))
    history.clearAllHistory()
    const group = repos.createGroupCode('Grupo', '#222', roots[2].id)
    history.historyUndo()
    expect(repos.listCodes()).toEqual(roots.map((c) => ({ ...c, usageCount: 0 })))
    history.historyRedo()
    expect(repos.listCodes().find((c) => c.id === roots[2].id)?.parentId).toBe(group.id)
    history.historyUndo()
    expect(repos.listCodes()).toEqual(roots.map((c) => ({ ...c, usageCount: 0 })))
    db.closeDatabase()
  })

  it('restores parent and order when undoing grouping across different levels', () => {
    const parent = repos.createCode({ name: 'Pai', color: '#111' })
    repos.createCode({ name: 'Primeiro', color: '#111', parentId: parent.id })
    const child = repos.createCode({ name: 'Filho', color: '#111', parentId: parent.id })
    const root = repos.createCode({ name: 'Solto', color: '#111' })
    const before = repos.listCodes()
    history.clearAllHistory()
    const group = repos.createGroupFromCodes('Grupo', '#222', [root.id, child.id])
    const grouped = repos.listCodes()
    expect(grouped.find((c) => c.id === child.id)?.parentId).toBe(group.id)
    history.historyUndo()
    expect(repos.listCodes()).toEqual(before)
    history.historyRedo()
    expect(repos.listCodes()).toEqual(grouped)
    db.closeDatabase()
  })

  it('keeps the entry when undo throws instead of desyncing', async () => {
    const { pushHistory } = history
    pushHistory({ label: 'bomba', undo: () => { throw new Error('boom') }, redo: () => undefined })
    expect(() => history.historyUndo()).toThrow('boom')
    const state = history.historyState()
    expect(state.canUndo).toBe(true)
    expect(state.undoLabel).toBe('bomba')
    expect(state.canRedo).toBe(false)
    db.closeDatabase()
  })

  it('ignores no-op updates instead of stacking empty entries', async () => {
    const a = repos.createCode({ name: 'A', color: '#111' })
    history.clearAllHistory()
    repos.updateCode({ id: a.id, name: 'A' })
    expect(history.historyState().canUndo).toBe(false)
    const doc = repos.createDocument({ name: 'D', plainText: 'txt', originalFormat: 'txt', sourceFilename: 'd.txt' })
    history.clearAllHistory()
    repos.renameDocument(doc.id, 'D')
    expect(history.historyState().canUndo).toBe(false)
    db.closeDatabase()
  })

  it('invalidates redo on new edit', async () => {
    const a = repos.createCode({ name: 'A', color: '#111' })
    history.clearAllHistory()
    repos.updateCode({ id: a.id, name: 'A2' })
    history.historyUndo()
    expect(history.historyState().canRedo).toBe(true)
    repos.updateCode({ id: a.id, name: 'A3' })
    expect(history.historyState().canRedo).toBe(false)
    expect(history.historyState().canUndo).toBe(true)
    db.closeDatabase()
  })
})
