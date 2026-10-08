import { describe, expect, it } from 'vitest'
import { clampLaneWidth, laneBounds } from '../src/renderer/src/lib/barLayout'

// Valores reais do TranscriptPanel.
const TETO = 640
const PISO = 120

describe('laneBounds', () => {
  it('o piso cresce com o número de colunas', () => {
    expect(laneBounds(1, TETO, PISO).minimo).toBe(120)
    expect(laneBounds(4, TETO, PISO).minimo).toBe(336)
  })

  // Em 8 colunas o piso (8*80+16 = 656) passa do teto fixo de 640. Antes o
  // arrasto era limitado a 640 enquanto a largura efetiva ficava presa em 656,
  // então o divisor mudava o estado e nada acontecia na tela, sem dizer por quê.
  it('o teto nunca fica abaixo do piso', () => {
    const { minimo, maximo } = laneBounds(8, TETO, PISO)
    expect(minimo).toBe(656)
    expect(maximo).toBeGreaterThanOrEqual(minimo)
  })

  it('o teto alcança a largura de onde o arrasto começou', () => {
    // 5 colunas: a largura automática já é 766, e o teto não pode ficar abaixo
    expect(laneBounds(5, TETO, PISO, 766).maximo).toBeGreaterThanOrEqual(766)
  })

  it('o teto cresce com as colunas em vez de empatar com o piso', () => {
    const { minimo, maximo } = laneBounds(8, TETO, PISO)
    // sem folga entre piso e teto o divisor fica travado de novo
    expect(maximo).toBeGreaterThan(minimo)
  })
})

describe('clampLaneWidth', () => {
  it('o divisor continua funcionando com muitas colunas', () => {
    const inicial = laneBounds(8, TETO, PISO).minimo
    const alargado = clampLaneWidth(inicial + 100, 8, TETO, PISO, inicial)
    expect(alargado).toBe(inicial + 100)
  })

  // O startWidth podia ser maior que o teto (largura automática), e o primeiro
  // movimento jogava a faixa para 640 de uma vez: mais de 500px de salto com 8
  // colunas. Mover um pixel precisa mover um pixel.
  it('o primeiro pixel move um pixel, não dá salto', () => {
    const inicial = 766 // 5 colunas em largura automática
    expect(clampLaneWidth(inicial - 1, 5, TETO, PISO, inicial)).toBe(inicial - 1)
  })

  // Com 8 colunas o salto chegava a passar de 500px: a largura automática é
  // 1216 e o primeiro movimento jogava a faixa direto para o teto fixo de 640.
  it('não puxa a faixa para o teto fixo no primeiro movimento', () => {
    const inicial = 1216
    expect(clampLaneWidth(inicial - 1, 8, TETO, PISO, inicial)).toBe(inicial - 1)
  })

  it('não deixa estreitar abaixo do que as colunas precisam', () => {
    expect(clampLaneWidth(0, 4, TETO, PISO)).toBe(336)
  })

  it('respeita o teto padrão quando as colunas são poucas', () => {
    expect(clampLaneWidth(5000, 2, TETO, PISO)).toBe(TETO)
  })
})
