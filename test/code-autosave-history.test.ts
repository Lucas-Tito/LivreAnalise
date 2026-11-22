import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, openDatabase } from '../src/main/db'
import { createCode, listCodes, updateCode } from '../src/main/db/repositories'
import { clearAllHistory, historyRedo, historyState, historyUndo } from '../src/main/history/stack'

beforeEach(() => { openDatabase(':memory:'); clearAllHistory() })
afterEach(() => { closeDatabase(); clearAllHistory(); vi.restoreAllMocks() })

function getCode(id: number) {
  const { usageCount: _, ...code } = listCodes().find((code) => code.id === id)!
  return code
}

describe('histórico do autosave de código', () => {
  it('agrupa nome, cor e descrição da mesma sessão e refaz o estado mais recente', () => {
    const code = createCode({ name: 'Antes', color: '#111', description: 'Original' })
    clearAllHistory()
    updateCode({ id: code.id, name: 'Depois', historyGroup: 'sessão' })
    updateCode({ id: code.id, color: '#222', historyGroup: 'sessão' })
    updateCode({ id: code.id, description: 'Detalhe', historyGroup: 'sessão' })
    historyUndo()
    expect(getCode(code.id)).toEqual(code)
    expect(historyState().canUndo).toBe(false)
    historyRedo()
    expect(getCode(code.id)).toEqual({ ...code, name: 'Depois', color: '#222', description: 'Detalhe' })
  })

  it('separa reaberturas do editor e não mistura com memos nem movimentos', () => {
    const parent = createCode({ name: 'Pai', color: '#111' })
    const code = createCode({ name: 'Antes', color: '#111' })
    clearAllHistory()
    updateCode({ id: code.id, name: 'Primeira', historyGroup: 'a' })
    updateCode({ id: code.id, name: 'Segunda', historyGroup: 'b' })
    updateCode({ id: code.id, memo: 'Memo', historyGroup: 'b' })
    updateCode({ id: code.id, parentId: parent.id, historyGroup: 'b' })
    historyUndo()
    expect(getCode(code.id).parentId).toBeNull()
    expect(getCode(code.id).memo).toBe('Memo')
    historyUndo()
    expect(getCode(code.id).memo).toBe('')
    historyUndo()
    expect(getCode(code.id).name).toBe('Primeira')
    historyUndo()
    expect(getCode(code.id).name).toBe('Antes')
    expect(historyState().canUndo).toBe(false)
  })

  it('mantém pausas longas como etapas separadas', () => {
    const code = createCode({ name: 'Antes', color: '#111' })
    clearAllHistory()
    vi.spyOn(Date, 'now').mockReturnValue(1000)
    updateCode({ id: code.id, name: 'Primeira', historyGroup: 'a' })
    vi.mocked(Date.now).mockReturnValue(10000)
    updateCode({ id: code.id, name: 'Segunda', historyGroup: 'a' })
    historyUndo()
    expect(getCode(code.id).name).toBe('Primeira')
    historyUndo()
    expect(getCode(code.id).name).toBe('Antes')
  })
})
