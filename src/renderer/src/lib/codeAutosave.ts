export interface CodeDialogValue {
  name: string
  color: string
  description: string
}

export function normalizeCodeDraft(draft: CodeDialogValue): CodeDialogValue {
  return { ...draft, name: draft.name.trim(), description: draft.description.trim() }
}

// Serializa as escritas e inclui no flush o que mudou durante um IPC pendente.
// Não altera os campos da tela: o desfazer nativo da digitação continua intacto.
export function createCodeSaver(initial: CodeDialogValue, write: (draft: CodeDialogValue) => Promise<void>): {
  change: (draft: CodeDialogValue) => void
  flush: () => Promise<void>
} {
  let draft = initial
  let lastDraft = initial
  let saved = initial
  let pending: Promise<void> | null = null
  return {
    change: (next) => { draft = next },
    flush: () => {
      if (pending) return pending
      pending = (async () => {
        while (true) {
          const currentDraft = draft
          const normalized = normalizeCodeDraft(currentDraft)
          if (!normalized.name) throw new Error('O nome do código não pode ficar vazio.')
          const next: CodeDialogValue = {
            name: currentDraft.name === lastDraft.name ? saved.name : normalized.name,
            color: currentDraft.color,
            description: currentDraft.description === lastDraft.description ? saved.description : normalized.description
          }
          if (next.name === saved.name && next.color === saved.color && next.description === saved.description) return
          await write(next)
          lastDraft = currentDraft
          saved = next
        }
      })().finally(() => { pending = null })
      return pending
    }
  }
}
