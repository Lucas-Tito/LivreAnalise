import { getActivePath } from '../db'

export interface HistoryEntry {
  label: string
  undo: () => void
  redo: () => void
}

export interface HistoryState {
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
}

const MAX_ENTRIES = 100

// Pilhas por projeto (chave = caminho do .liva, ou ':memory:' nos testes).
// O histórico reinicia ao trocar de projeto porque a chave muda.
const stacks = new Map<string, { undo: HistoryEntry[]; redo: HistoryEntry[] }>()

function key(): string {
  try {
    return getActivePath() ?? ':memory:'
  } catch {
    return ':memory:'
  }
}

function stackFor(k: string): { undo: HistoryEntry[]; redo: HistoryEntry[] } {
  let s = stacks.get(k)
  if (!s) {
    s = { undo: [], redo: [] }
    stacks.set(k, s)
  }
  return s
}

export function pushHistory(entry: HistoryEntry): void {
  const s = stackFor(key())
  s.undo.push(entry)
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
