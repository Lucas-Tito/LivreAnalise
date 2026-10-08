export interface NoteDraft {
  title: string
  body: string
}

export function mesmoConteudo(a: NoteDraft, b: NoteDraft): boolean {
  return a.title === b.title && a.body === b.body
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
