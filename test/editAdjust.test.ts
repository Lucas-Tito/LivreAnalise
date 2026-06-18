import { describe, expect, it } from 'vitest'
import {
  adjustCodings,
  diffText,
  type AdjustableCoding
} from '../src/main/services/editAdjust'

function c(id: number, startPos: number, endPos: number): AdjustableCoding {
  return { id, startPos, endPos }
}

describe('diffText', () => {
  it('returns null when text is unchanged', () => {
    expect(diffText('abc', 'abc')).toBeNull()
  })

  it('detects a single insertion', () => {
    // "abXYcd" inserted "XY" at index 2
    expect(diffText('abcd', 'abXYcd')).toEqual({
      changeStart: 2,
      oldChangeEnd: 2,
      delta: 2
    })
  })

  it('detects a deletion', () => {
    // remove "cd" from index 2..4
    expect(diffText('abcdef', 'abef')).toEqual({
      changeStart: 2,
      oldChangeEnd: 4,
      delta: -2
    })
  })
})

describe('adjustCodings', () => {
  it('leaves codings before the edit untouched', () => {
    const res = adjustCodings([c(1, 0, 2)], 'abcdef', 'abcdefXY')
    expect(res.updates).toEqual([])
    expect(res.removeIds).toEqual([])
  })

  it('shifts codings after an insertion by the delta', () => {
    // insert 3 chars at index 2; coding at [4,6) -> [7,9)
    const res = adjustCodings([c(1, 4, 6)], 'abcdef', 'abXXXcdef')
    expect(res.updates).toEqual([{ id: 1, startPos: 7, endPos: 9 }])
    expect(res.removeIds).toEqual([])
  })

  it('shifts codings after a deletion by the (negative) delta', () => {
    // delete 2 chars at [2,4); coding at [4,6) -> [2,4)
    const res = adjustCodings([c(1, 4, 6)], 'abcdef', 'abef')
    expect(res.updates).toEqual([{ id: 1, startPos: 2, endPos: 4 }])
  })

  it('extends a coding when the edit happens fully inside it', () => {
    // coding [0,6) over "abcdef"; insert 2 chars at index 3 -> end grows by 2
    const res = adjustCodings([c(1, 0, 6)], 'abcdef', 'abcZZdef')
    expect(res.updates).toEqual([{ id: 1, startPos: 0, endPos: 8 }])
  })

  it('removes a coding that straddles the edited boundary', () => {
    // coding [1,3) over "abcdef"; edit replaces region [2,5)
    const res = adjustCodings([c(1, 1, 3)], 'abcdef', 'abXYZf')
    expect(res.removeIds).toEqual([1])
    expect(res.updates).toEqual([])
  })

  it('handles multiple codings around the edit at once', () => {
    // "abcdefgh"; replace region [3,6) "def" with "ZZ" (delta -1)
    // c1 [0,2) before -> keep; c2 [4,7) straddles the right boundary -> remove; c3 [6,8) after -> -1
    const res = adjustCodings(
      [c(1, 0, 2), c(2, 4, 7), c(3, 6, 8)],
      'abcdefgh',
      'abcZZgh'
    )
    expect(res.removeIds).toEqual([2])
    expect(res.updates).toEqual([{ id: 3, startPos: 5, endPos: 7 }])
  })
})
