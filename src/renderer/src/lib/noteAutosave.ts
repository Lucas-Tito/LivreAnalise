export interface NoteDraft {
  title: string
  body: string
}

export interface PendingNote {
  project: string | null
  id: number
  documentId: number | null
  saver: ReturnType<typeof createNoteSaver>
  timer: ReturnType<typeof setTimeout> | null
}

export function mesmoConteudo(a: NoteDraft, b: NoteDraft): boolean {
  const title = (value: string): string => value.trim() === '' ? '' : value
  return title(a.title) === title(b.title) && a.body === b.body
}

// Uma única escrita por vez. Flush inclui também o que foi digitado enquanto
// a escrita estava em andamento e nunca esconde uma falha de persistência.
export function createNoteSaver(initial: NoteDraft, write: (draft: NoteDraft) => Promise<NoteDraft>): {
  read: () => NoteDraft
  change: (draft: NoteDraft) => void
  flush: () => Promise<void>
} {
  let draft = initial
  let saved = initial
  let pending: Promise<void> | null = null
  return {
    read: () => draft,
    change: (next) => { draft = next },
    flush: () => {
      if (pending) return pending
      pending = (async () => {
        while (!mesmoConteudo(draft, saved)) {
          saved = await write({ ...draft })
        }
      })().finally(() => { pending = null })
      return pending
    }
  }
}

/**
 * Decide o estado do editor depois que um save volta do banco.
 *
 * O save leva dois round-trips de IPC, e a pessoa continua digitando durante a
 * ida. Antes o editor resolvia isso sobrescrevendo o texto da tela com o que
 * acabara de ser gravado: o que foi digitado no meio do caminho sumia, e o
 * indicador ainda dizia "Salvo" -- a tela mostrava um texto e o banco guardava
 * outro, com o rodape garantindo que estava tudo certo.
 *
 * A regra certa e nunca tocar no texto da tela: comparar, e se mudou, continuar
 * pendente e agendar outro save.
 */
export function aposSalvar(
  naTela: NoteDraft,
  gravado: NoteDraft
): { status: 'saved' | 'dirty'; reagendar: boolean } {
  const limpo = mesmoConteudo(naTela, gravado)
  return { status: limpo ? 'saved' : 'dirty', reagendar: !limpo }
}
