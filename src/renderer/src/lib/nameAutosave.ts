// Uma escrita por vez; sair inclui também o que mudou durante a gravação.
export function createNameSaver(initial: string, write: (name: string) => Promise<void>): {
  change: (name: string) => void
  flush: () => Promise<void>
} {
  let draft = initial
  let saved = initial.trim()
  let pending: Promise<void> | null = null
  return {
    change: (next) => { draft = next },
    flush: () => {
      if (pending) return pending
      pending = (async () => {
        while (true) {
          const next = draft.trim()
          if (!next) throw new Error('O nome não pode ficar vazio.')
          if (next === saved) return
          await write(next)
          saved = next
        }
      })().finally(() => { pending = null })
      return pending
    }
  }
}
