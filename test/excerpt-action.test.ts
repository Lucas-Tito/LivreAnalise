import { describe, expect, it } from 'vitest'
import { excerptAction } from '../src/renderer/src/lib/excerptAction'

describe('ação ao clicar em um trecho', () => {
  it('abre diretamente uma única nota', () => {
    expect(excerptAction([], [1])).toBe('note')
  })
  it('seleciona diretamente uma única codificação', () => {
    expect(excerptAction([1], [])).toBe('code')
  })
  it('pede escolha quando há código e nota', () => {
    expect(excerptAction([1], [2])).toBe('choose')
  })
  it('não escolhe automaticamente entre notas ou códigos sobrepostos', () => {
    expect(excerptAction([], [1, 2])).toBe('choose')
    expect(excerptAction([1, 2], [])).toBe('choose')
    expect(excerptAction([1, 2], [3, 4])).toBe('choose')
  })
  it('não faz nada em texto sem marcações', () => {
    expect(excerptAction([], [])).toBe('none')
  })
})
