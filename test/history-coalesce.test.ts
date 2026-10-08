import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAllHistory,
  historyState,
  historyRedo,
  historyUndo,
  pushHistory
} from '../src/main/history/stack'

// O autosave de nota grava a cada pausa de digitação. Sem coalescência, um memo
// de dois parágrafos empilhava umas 30 entradas: o Ctrl+Z virava "desfazer o
// memo pedaço por pedaço", e as ações de verdade eram empurradas para fora da
// pilha de 100 — apagar um código por engano podia ficar irrecuperável.
describe('coalescência do histórico', () => {
  beforeEach(() => {
    clearAllHistory()
  })

  function entrada(label: string, registro: string[], chave?: string) {
    return {
      label,
      coalesceKey: chave,
      undo: () => registro.push(`undo:${label}`),
      redo: () => registro.push(`redo:${label}`)
    }
  }

  it('junta edições seguidas da mesma nota num passo só', () => {
    const r: string[] = []
    pushHistory(entrada('editar nota 1', r, 'nota:1'), 1000)
    pushHistory(entrada('editar nota 2', r, 'nota:1'), 2000)
    pushHistory(entrada('editar nota 3', r, 'nota:1'), 3000)

    historyUndo()

    // desfez até o estado anterior ao PRIMEIRO save, não ao último
    expect(r).toEqual(['undo:editar nota 1'])
    expect(historyState().canUndo).toBe(false)
  })

  it('não junta notas diferentes', () => {
    const r: string[] = []
    pushHistory(entrada('nota A', r, 'nota:1'), 1000)
    pushHistory(entrada('nota B', r, 'nota:2'), 1500)

    historyUndo()
    historyUndo()

    expect(r).toEqual(['undo:nota B', 'undo:nota A'])
  })

  // Depois de uma pausa longa é outra intenção: desfazer precisa voltar só o
  // último trecho escrito, não o memo inteiro.
  it('não junta depois da janela de tempo', () => {
    const r: string[] = []
    pushHistory(entrada('primeiro', r, 'nota:1'), 1000)
    pushHistory(entrada('depois de muito tempo', r, 'nota:1'), 60000)

    expect(historyState().canUndo).toBe(true)
    historyUndo()
    historyUndo()
    expect(r).toEqual(['undo:depois de muito tempo', 'undo:primeiro'])
  })

  it('não junta o que não pediu para ser juntado', () => {
    const r: string[] = []
    pushHistory(entrada('apagar código', r), 1000)
    pushHistory(entrada('apagar outro', r), 1100)

    historyUndo()
    historyUndo()

    expect(r).toEqual(['undo:apagar outro', 'undo:apagar código'])
  })

  // O ponto que mais importa: a exclusão do código não pode ser empurrada para
  // fora da pilha por um memo longo.
  it('um memo longo não enterra a ação que veio antes', () => {
    const r: string[] = []
    pushHistory(entrada('excluir código', r), 1000)
    for (let i = 0; i < 120; i++) {
      pushHistory(entrada(`memo ${i}`, r, 'nota:7'), 2000 + i * 100)
    }

    // 2 entradas, não 100 descartando o fundo
    historyUndo()
    historyUndo()

    expect(r).toEqual(['undo:memo 0', 'undo:excluir código'])
  })

  // Coalescer mantém o `undo` do primeiro save, mas o `redo` tem que ser o do
  // último: refazer precisa devolver o texto mais recente, não o intermediário.
  it('o redo coalescido leva ao estado mais recente', () => {
    const r: string[] = []
    pushHistory(entrada('v1', r, 'nota:1'), 1000)
    pushHistory(entrada('v2', r, 'nota:1'), 2000)

    historyUndo()
    r.length = 0
    historyRedo()

    expect(r).toEqual(['redo:v2'])
  })
})
