import { describe, expect, it } from 'vitest'
import { MIN_RELOCALIZE_LEN, relocalizarTrecho } from '../src/shared/editAdjust'

const TRECHO = 'o entrevistado se contradiz sobre o prazo'

describe('relocalizarTrecho', () => {
  // Mover um parágrafo de lugar apaga as posições mas preserva o texto. Antes
  // disto a citação era apagada e a nota desvinculada com o trecho inteiro
  // ainda ali no documento.
  it('acha o trecho que mudou de lugar', () => {
    const novo = `abertura nova aqui. ${TRECHO} e segue.`
    expect(relocalizarTrecho(TRECHO, novo)).toEqual({
      startPos: novo.indexOf(TRECHO),
      endPos: novo.indexOf(TRECHO) + TRECHO.length
    })
  })

  it('desiste quando o trecho não existe mais', () => {
    expect(relocalizarTrecho(TRECHO, 'texto completamente diferente agora')).toBeNull()
  })

  // Duas ocorrências não dá para escolher sem perguntar, e perguntar no meio de
  // uma edição atrapalha mais do que ajuda. Fica para a oferta manual.
  it('desiste quando há mais de uma ocorrência', () => {
    expect(relocalizarTrecho(TRECHO, `${TRECHO} ... e de novo: ${TRECHO}`)).toBeNull()
  })

  // Casar por texto é heurística: um trecho curto acha uma ocorrência única em
  // algum lugar que não tem nada a ver com a marcação original.
  it('não religa trecho curto demais', () => {
    expect(relocalizarTrecho('sim', 'ele disse sim uma vez só')).toBeNull()
  })

  // Em transcrição um trecho pode ter 40 caracteres e quase todos serem quebra
  // de linha: comprido no contador, sem distinguir nada de fato.
  it('conta caractere útil, não espaço em branco', () => {
    const espacoso = `oi${'\n'.repeat(40)}tchau`
    expect(relocalizarTrecho(espacoso, `antes ${espacoso} depois`)).toBeNull()
  })

  it('aceita o limite exato', () => {
    const exato = 'x'.repeat(MIN_RELOCALIZE_LEN)
    expect(relocalizarTrecho(exato, `antes ${exato} depois`)).not.toBeNull()
  })

  it('conta ocorrência sobreposta como ambígua', () => {
    const repetido = 'ab'.repeat(MIN_RELOCALIZE_LEN)
    expect(relocalizarTrecho(repetido, `${repetido}ab`)).toBeNull()
  })
})
