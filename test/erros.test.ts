import { describe, expect, it } from 'vitest'
import { mensagemDeErro } from '../src/renderer/src/lib/erros'

// O erro do processo principal chega embrulhado duas vezes: o main responde com
// `e.toString()`, que já traz o "Error: ", e o renderer lança
// `Error invoking remote method '<canal>': <aquilo>`. Mostrar isso cru grudava
// jargão de IPC em inglês na frente de uma frase escrita em português.
describe('mensagemDeErro', () => {
  it('tira o prefixo do IPC e o "Error:" que o toString acrescenta', () => {
    const e = new Error(
      "Error invoking remote method 'codes:moveMany': Error: O destino precisa ser um grupo de 1º nível."
    )
    expect(mensagemDeErro(e)).toBe('O destino precisa ser um grupo de 1º nível.')
  })

  it('funciona com qualquer subtipo de Error do main', () => {
    const e = new Error("Error invoking remote method 'notes:update': TypeError: x não é função")
    expect(mensagemDeErro(e)).toBe('x não é função')
  })

  it('não estraga mensagem que chega sem prefixo', () => {
    expect(mensagemDeErro(new Error('Nenhum projeto aberto'))).toBe('Nenhum projeto aberto')
  })

  // Uma mensagem que fosse só o prefixo deixaria a tela com erro em branco:
  // melhor um texto genérico do que um aviso vazio.
  it('cai no padrão quando não sobra nada', () => {
    const e = new Error("Error invoking remote method 'x:y': Error: ")
    expect(mensagemDeErro(e, 'Não foi possível salvar.')).toBe('Não foi possível salvar.')
  })

  it('aceita o que não é Error', () => {
    expect(mensagemDeErro('texto solto')).toBe('texto solto')
    expect(mensagemDeErro(undefined, 'padrão')).toBe('padrão')
  })
})
