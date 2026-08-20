import { describe, expect, it } from 'vitest'
import {
  applicableCodes,
  canReceiveChild,
  groupIds
} from '../src/renderer/src/lib/codeTree'
import type { Code } from '../src/shared/types'

function code(id: number, parentId: number | null = null): Code {
  return {
    id,
    guid: `g${id}`,
    name: `code ${id}`,
    color: '#000',
    description: null,
    parentId,
    sortOrder: 0,
    createdAt: ''
  }
}

describe('groupIds', () => {
  it('treats a code with children as a group', () => {
    expect([...groupIds([code(1), code(2, 1)])]).toEqual([1])
  })

  it('finds no group in a flat list', () => {
    expect(groupIds([code(1), code(2)]).size).toBe(0)
  })
})

describe('applicableCodes', () => {
  it('keeps every code when none has children', () => {
    expect(applicableCodes([code(1), code(2)]).map((c) => c.id)).toEqual([1, 2])
  })

  // O bug: o popover de codificacao oferecia os grupos para aplicar no texto.
  it('never offers a group to be applied to text', () => {
    const codes = [code(1), code(2, 1), code(3, 1), code(4)]
    expect(applicableCodes(codes).map((c) => c.id)).toEqual([2, 3, 4])
  })
})

describe('canReceiveChild', () => {
  it('lets a root code become a group', () => {
    expect(canReceiveChild(code(1))).toBe(true)
  })

  it('refuses a third level', () => {
    expect(canReceiveChild(code(2, 1))).toBe(false)
  })
})
