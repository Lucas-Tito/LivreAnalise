// O Electron embrulha o erro do processo principal duas vezes antes de ele
// chegar aqui. O main responde com `error: e.toString()`, que ja inclui o
// "Error: ", e o renderer lanca
// `Error invoking remote method '<canal>': <aquilo>`.
//
// Mostrar `err.message` cru gruda jargao de IPC em ingles na frente de uma frase
// escrita com cuidado em portugues. Esta funcao existe para nao reescrever a
// mesma expressao regular em cada lugar que exibe erro -- ja eram quatro.
const PREFIXO_IPC = /^Error invoking remote method '[^']+':\s*(?:\w*Error:\s*)?/

export function mensagemDeErro(e: unknown, padrao = 'Algo deu errado.'): string {
  const bruta = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  const limpa = bruta.replace(PREFIXO_IPC, '').trim()
  return limpa === '' ? padrao : limpa
}
