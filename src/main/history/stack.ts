import { getActivePath } from '../db'

export interface HistoryEntry {
  label: string
  undo: () => void
  redo: () => void
  /**
   * Entradas consecutivas com a mesma chave, dentro de COALESCE_MS, viram um
   * passo so. Existe por causa do autosave de nota: ele grava a cada pausa de
   * digitacao, entao um memo de dois paragrafos empilhava umas 30 entradas,
   * transformava o Ctrl+Z em "desfazer o memo pedaco por pedaco" e empurrava as
   * acoes de verdade para fora da pilha de 100 -- apagar um codigo por engano
   * podia ficar irrecuperavel depois de escrever um memo longo.
   */
  coalesceKey?: string
}

type StoredEntry = HistoryEntry & { at: number }

export interface HistoryState {
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
}

const MAX_ENTRIES = 100
const COALESCE_MS = 5000

// Pilhas por projeto (chave = caminho do .liva, ou ':memory:' nos testes).
// O histórico reinicia ao trocar de projeto porque a chave muda.
const stacks = new Map<string, { undo: StoredEntry[]; redo: StoredEntry[] }>()

function key(): string {
  try {
    return getActivePath() ?? ':memory:'
  } catch {
    return ':memory:'
  }
}

function stackFor(k: string): { undo: StoredEntry[]; redo: StoredEntry[] } {
  let s = stacks.get(k)
  if (!s) {
    s = { undo: [], redo: [] }
    stacks.set(k, s)
  }
  return s
}

export function pushHistory(entry: HistoryEntry, agora: number = Date.now()): void {
  const s = stackFor(key())
  const topo = s.undo[s.undo.length - 1]
  if (
    entry.coalesceKey != null &&
    topo?.coalesceKey === entry.coalesceKey &&
    agora - topo.at <= COALESCE_MS
  ) {
    // estende a entrada do topo: o `undo` continua apontando para o estado de
    // antes do primeiro save, e so o `redo` passa a ser o mais recente
    topo.redo = entry.redo
    topo.label = entry.label
    topo.at = agora
    s.redo = []
    return
  }
  s.undo.push({ ...entry, at: agora })
  if (s.undo.length > MAX_ENTRIES) s.undo.shift()
  s.redo = []
}

export function historyState(): HistoryState {
  const s = stackFor(key())
  const top = s.undo[s.undo.length - 1] ?? null
  const rtop = s.redo[s.redo.length - 1] ?? null
  return {
    canUndo: s.undo.length > 0,
    canRedo: s.redo.length > 0,
    undoLabel: top?.label ?? null,
    redoLabel: rtop?.label ?? null
  }
}

export function historyUndo(): string | null {
  const s = stackFor(key())
  const entry = s.undo[s.undo.length - 1]
  if (!entry) return null
  // Executa antes de mover a entrada: se lançar, ela continua na pilha de
  // undo e o histórico não dessincroniza do banco.
  entry.undo()
  s.undo.pop()
  s.redo.push(entry)
  return entry.label
}

export function historyRedo(): string | null {
  const s = stackFor(key())
  const entry = s.redo[s.redo.length - 1]
  if (!entry) return null
  entry.redo()
  s.redo.pop()
  s.undo.push(entry)
  return entry.label
}

export function clearHistoryFor(k: string): void {
  stacks.delete(k)
}

export function clearAllHistory(): void {
  stacks.clear()
}
