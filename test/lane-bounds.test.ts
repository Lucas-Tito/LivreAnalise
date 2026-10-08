import { describe, expect, it } from 'vitest'
import {
  clampLaneWidth,
  laneBounds,
  larguraGuardada,
  type LaneConfig
} from '../src/renderer/src/lib/barLayout'

// Valores reais do TranscriptPanel.
const TETO = 640
const PISO = 120
const LANE: LaneConfig = {
  minimoPorColuna: 72 + 8,
  padding: 16,
  autoPorColuna: 150,
  tetoPadrao: TETO,
  pisoAbsoluto: PISO
}

describe('laneBounds', () => {
  it('o piso cresce com o número de colunas', () => {
    expect(laneBounds(1, LANE).minimo).toBe(120)
    expect(laneBounds(4, LANE).minimo).toBe(336)
  })

  // Em 8 colunas o piso (8*80+16 = 656) passa do teto fixo de 640. Antes o
  // arrasto era limitado a 640 enquanto a largura efetiva ficava presa em 656,
  // então o divisor mudava o estado e nada acontecia na tela, sem dizer por quê.
  it('o teto nunca fica abaixo do piso', () => {
    const { minimo, maximo } = laneBounds(8, LANE)
    expect(minimo).toBe(656)
    expect(maximo).toBeGreaterThanOrEqual(minimo)
  })

  it('o teto alcança a largura de onde o arrasto começou', () => {
    // 5 colunas: a largura automática já é 766, e o teto não pode ficar abaixo
    expect(laneBounds(5, LANE, 766).maximo).toBeGreaterThanOrEqual(766)
  })

  it('o teto cresce com as colunas em vez de empatar com o piso', () => {
    const { minimo, maximo } = laneBounds(8, LANE)
    // sem folga entre piso e teto o divisor fica travado de novo
    expect(maximo).toBeGreaterThan(minimo)
  })
})

describe('clampLaneWidth', () => {
  it('o divisor continua funcionando com muitas colunas', () => {
    const inicial = laneBounds(8, LANE).minimo
    const alargado = clampLaneWidth(inicial + 100, 8, LANE, inicial)
    expect(alargado).toBe(inicial + 100)
  })

  // O startWidth podia ser maior que o teto (largura automática), e o primeiro
  // movimento jogava a faixa para 640 de uma vez: mais de 500px de salto com 8
  // colunas. Mover um pixel precisa mover um pixel.
  it('o primeiro pixel move um pixel, não dá salto', () => {
    const inicial = 766 // 5 colunas em largura automática
    expect(clampLaneWidth(inicial - 1, 5, LANE, inicial)).toBe(inicial - 1)
  })

  // Com 8 colunas o salto chegava a passar de 500px: a largura automática é
  // 1216 e o primeiro movimento jogava a faixa direto para o teto fixo de 640.
  it('não puxa a faixa para o teto fixo no primeiro movimento', () => {
    const inicial = 1216
    expect(clampLaneWidth(inicial - 1, 8, LANE, inicial)).toBe(inicial - 1)
  })

  it('não deixa estreitar abaixo do que as colunas precisam', () => {
    expect(clampLaneWidth(0, 4, LANE)).toBe(336)
  })

  it('respeita o teto padrão quando as colunas são poucas', () => {
    expect(clampLaneWidth(5000, 2, LANE)).toBe(TETO)
  })
})

describe('larguraGuardada', () => {
  // O teto do arrasto cresce com as colunas, mas a leitura do localStorage
  // mantinha a constante de 640: uma largura legítima de 900px era descartada
  // na reabertura, e o arrasto destravado não sobrevivia justamente nos casos
  // que o destravamento liberou.
  it('aceita largura acima do teto fixo', () => {
    expect(larguraGuardada('900', LANE)).toBe(900)
  })

  it('recusa abaixo do piso absoluto', () => {
    expect(larguraGuardada('40', LANE)).toBeNull()
  })

  it('trata os casos ruins de localStorage', () => {
    expect(larguraGuardada(null, LANE)).toBeNull()
    // Number('') é 0, não NaN: sem o guard isso viraria o piso
    expect(larguraGuardada('', LANE)).toBeNull()
    expect(larguraGuardada('abc', LANE)).toBeNull()
    expect(larguraGuardada('Infinity', LANE)).toBeNull()
  })

  it('aceita o piso exato', () => {
    expect(larguraGuardada(String(PISO), LANE)).toBe(PISO)
  })
})
