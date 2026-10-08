import { describe, expect, it } from 'vitest'
import { acharOcorrencias, casaBusca, mesmoTermo, normalizarBusca } from '../src/shared/busca'

describe('casaBusca', () => {
  // O filtro exigia o termo exato: procurar "comunicacao" não achava
  // "COMUNICAÇÃO", e digitar o acento certo é justamente o que ninguém faz ao
  // filtrar uma lista de 399 códigos.
  it('acha sem acento o que está com acento', () => {
    expect(casaBusca('COMUNICAÇÃO', 'comunicacao')).toBe(true)
    expect(casaBusca('Conceituação', 'conceitua')).toBe(true)
    expect(casaBusca('não-aderência', 'nao aderencia'.replace(' ', '-'))).toBe(true)
  })

  it('acha com acento o que está sem acento', () => {
    expect(casaBusca('comunicacao', 'COMUNICAÇÃO')).toBe(true)
  })

  it('trata a cedilha', () => {
    expect(casaBusca('Avaliação', 'avaliacao')).toBe(true)
    expect(casaBusca('coração', 'coracao')).toBe(true)
  })

  it('não casa o que é diferente de fato', () => {
    expect(casaBusca('COMUNICAÇÃO', 'prazo')).toBe(false)
  })

  it('termo vazio casa com tudo, para a lista não sumir', () => {
    expect(casaBusca('qualquer', '   ')).toBe(true)
  })
})

describe('mesmoTermo', () => {
  // Usado para decidir "criar código novo" ou "esse já existe": sem dobrar o
  // acento, digitar "comunicacao" ofereceria criar um quase-duplicado de
  // "COMUNICAÇÃO".
  it('considera igual quem só difere no acento e na caixa', () => {
    expect(mesmoTermo('COMUNICAÇÃO', ' comunicacao ')).toBe(true)
  })

  it('não confunde termos diferentes', () => {
    expect(mesmoTermo('comunicação', 'comunicações')).toBe(false)
  })
})

describe('acharOcorrencias', () => {
  it('devolve as posições do texto original, não do normalizado', () => {
    const texto = 'a comunicação é isso: comunicação.'
    const hits = acharOcorrencias(texto, 'comunicacao')

    expect(hits).toHaveLength(2)
    // o recorte tem que devolver a palavra acentuada inteira
    for (const h of hits) {
      expect(texto.slice(h.start, h.end)).toBe('comunicação')
    }
  })

  // Normalizar muda o comprimento (ç e ã viram dois caracteres no NFD): usar o
  // índice do texto normalizado deslocaria o destaque.
  it('não desloca o destaque por causa dos acentos antes do achado', () => {
    const texto = 'ãçãçãç prazo'
    const [hit] = acharOcorrencias(texto, 'prazo')
    expect(texto.slice(hit.start, hit.end)).toBe('prazo')
  })

  // O Ctrl+F conta como qualquer navegador: ocorrências não se sobrepõem. O
  // teste anterior afirmava 3 para "aa" em "aaaa", ou seja travava como
  // desejado um contador que diria "1 de 3" onde o navegador diz "de 2".
  // (O `relocalizarTrecho` faz o oposto de propósito: lá duas ocorrências,
  // mesmo sobrepostas, significam "ambíguo, não adivinhe".)
  it('não conta ocorrência sobreposta, como o navegador', () => {
    expect(acharOcorrencias('aaaa', 'aa')).toHaveLength(2)
  })

  // Em NFD o acento é um caractere separado: o fim do destaque precisa incluí-lo,
  // senão ele aparece solto encostado no caractere seguinte. Texto colado do
  // macOS chega em NFD rotineiramente.
  it('inclui a marca combinante final no destaque', () => {
    const nfd = 'cafe\u0301 quente'
    const [hit] = acharOcorrencias(nfd, 'cafe')
    expect(nfd.slice(hit.start, hit.end)).toBe('cafe\u0301')
  })

  it('termo vazio não acha nada, em vez de achar tudo', () => {
    expect(acharOcorrencias('texto', '')).toEqual([])
  })

  it('não acha o que não está lá', () => {
    expect(acharOcorrencias('o entrevistado falou', 'prazo')).toEqual([])
  })
})

describe('normalizarBusca', () => {
  it('não estraga texto sem acento', () => {
    expect(normalizarBusca('Prazo 2026')).toBe('prazo 2026')
  })
})
