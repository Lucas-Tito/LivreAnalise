// Transições de projeto não podem se intercalar enquanto um diálogo ou uma
// importação aguarda I/O. Falha rápida, em vez de executar um clique antigo
// mais tarde sobre um projeto diferente.
let running = false

export async function withProjectOperation<T>(operation: () => Promise<T>): Promise<T> {
  if (running) throw new Error('Há uma operação de projeto em andamento. Aguarde sua conclusão.')
  running = true
  try {
    return await operation()
  } finally {
    running = false
  }
}
