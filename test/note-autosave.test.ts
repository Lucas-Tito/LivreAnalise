import { describe, expect, it } from 'vitest'
import { aposSalvar, mesmoConteudo } from '../src/renderer/src/lib/noteAutosave'

describe('aposSalvar', () => {
  // O defeito: o editor sobrescrevia o texto da tela com o que acabara de ser
  // gravado. Quem digitasse durante os dois round-trips de IPC perdia o que
  // escreveu, e o rodapé exibia "Salvo" — tela e banco diferentes, com o
  // indicador garantindo que estava tudo certo.
  it('continua pendente quando o texto mudou durante o save', () => {
    const gravado = { title: 'Contradição', body: 'o entrevistado se contradiz' }
    const naTela = { title: 'Contradição', body: 'o entrevistado se contradiz aqui' }

    const r = aposSalvar(naTela, gravado)

    expect(r.status).toBe('dirty')
    expect(r.reagendar).toBe(true)
  })

  it('fica salvo quando ninguém digitou durante o save', () => {
    const texto = { title: 'Contradição', body: 'o entrevistado se contradiz' }
    expect(aposSalvar(texto, { ...texto })).toEqual({ status: 'saved', reagendar: false })
  })

  it('trata o título como parte do conteúdo', () => {
    const r = aposSalvar(
      { title: 'Contradição aberta', body: 'x' },
      { title: 'Contradição', body: 'x' }
    )
    expect(r.status).toBe('dirty')
  })

  // Nota sem título guarda null no banco e string vazia na tela; o editor
  // normaliza antes de comparar, então os dois lados precisam bater.
  it('não acusa alteração por título vazio', () => {
    expect(aposSalvar({ title: '', body: 'x' }, { title: '', body: 'x' }).status).toBe('saved')
  })
})

describe('mesmoConteudo', () => {
  it('distingue corpo vazio de corpo com espaço', () => {
    expect(mesmoConteudo({ title: 'a', body: '' }, { title: 'a', body: ' ' })).toBe(false)
  })
})
