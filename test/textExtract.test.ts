import { describe, expect, it } from 'vitest'
import { normalizeText } from '../src/main/services/textExtract'

describe('normalizeText', () => {
  it('removes a leading BOM', () => {
    expect(normalizeText('\uFEFFhello')).toBe('hello')
  })

  it('converts CRLF to LF', () => {
    expect(normalizeText('a\r\nb\r\nc')).toBe('a\nb\nc')
  })

  it('converts lone CR to LF', () => {
    expect(normalizeText('a\rb')).toBe('a\nb')
  })

  it('keeps existing LF untouched and preserves length semantics', () => {
    const input = 'linha 1\nlinha 2\n'
    expect(normalizeText(input)).toBe(input)
  })

  it('handles mixed line endings consistently', () => {
    expect(normalizeText('x\r\ny\rz\n')).toBe('x\ny\nz\n')
  })
})
