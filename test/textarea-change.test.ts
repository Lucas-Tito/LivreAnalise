import { expect, it } from 'vitest'
import { applyTextareaChange } from '../src/renderer/src/lib/textareaChange'
import { adjustCodings } from '../src/shared/editAdjust'

it('preserves CRLF and intact short quotations when appending text', () => {
  const original = '\uFEFFprimeira linha\r\nsim\r\nterceira linha\r\nfim'
  const startPos = original.indexOf('sim')
  const next = applyTextareaChange(original, original.replace(/\r\n/g, '\n') + '!')
  expect(next).toBe(original + '!')
  expect(adjustCodings([{ id: 1, startPos, endPos: startPos + 3 }], original, next))
    .toEqual({ updates: [], removeIds: [] })
})

it('preserves mixed line endings outside the actual edit', () => {
  expect(applyTextareaChange('a\r\nb\nc\r\nd', 'a\nb!\nc\nd')).toBe('a\r\nb!\nc\r\nd')
  expect(applyTextareaChange('a\r\nb', 'a\nb')).toBe('a\r\nb')
})

it('maps edits and newly inserted lines back to raw offsets', () => {
  expect(applyTextareaChange('a\r\nb\r\nc', 'a\nx\ny\nc')).toBe('a\r\nx\r\ny\r\nc')
  expect(applyTextareaChange('a\r\nb\r\nc', 'a\nc')).toBe('a\r\nc')
  expect(applyTextareaChange('a\nb', 'a\nx\nb')).toBe('a\nx\nb')
  expect(applyTextareaChange('', 'novo\ntexto')).toBe('novo\ntexto')
})
