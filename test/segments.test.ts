import { describe, expect, it } from 'vitest'
import { computeSegments, markPendingSelection } from '../src/renderer/src/lib/segments'
import type { Coding } from '../src/shared/types'

function coding(id: number, startPos: number, endPos: number): Coding {
  return {
    id,
    guid: `g${id}`,
    documentId: 1,
    codeId: id,
    startPos,
    endPos,
    createdAt: ''
  }
}

describe('computeSegments', () => {
  it('returns empty array for empty text', () => {
    expect(computeSegments(0, [])).toEqual([])
  })

  it('returns a single uncoded segment when there are no codings', () => {
    const segs = computeSegments(10, [])
    expect(segs).toEqual([{ start: 0, end: 10, codingIds: [] }])
  })

  it('splits text into before / coded / after for a single coding', () => {
    const segs = computeSegments(10, [coding(1, 3, 6)])
    expect(segs).toEqual([
      { start: 0, end: 3, codingIds: [] },
      { start: 3, end: 6, codingIds: [1] },
      { start: 6, end: 10, codingIds: [] }
    ])
  })

  it('handles a coding starting at 0 and ending at length', () => {
    const segs = computeSegments(5, [coding(1, 0, 5)])
    expect(segs).toEqual([{ start: 0, end: 5, codingIds: [1] }])
  })

  it('produces overlapping segments with multiple coding ids', () => {
    // coding 1: [0,6), coding 2: [3,9)
    const segs = computeSegments(10, [coding(1, 0, 6), coding(2, 3, 9)])
    expect(segs).toEqual([
      { start: 0, end: 3, codingIds: [1] },
      { start: 3, end: 6, codingIds: [1, 2] },
      { start: 6, end: 9, codingIds: [2] },
      { start: 9, end: 10, codingIds: [] }
    ])
  })

  it('supports two codings on the exact same span (multi-code)', () => {
    const segs = computeSegments(8, [coding(1, 2, 5), coding(2, 2, 5)])
    expect(segs).toEqual([
      { start: 0, end: 2, codingIds: [] },
      { start: 2, end: 5, codingIds: [1, 2] },
      { start: 5, end: 8, codingIds: [] }
    ])
  })
})

describe('markPendingSelection', () => {
  it('marks nothing when pending is null', () => {
    const segs = computeSegments(10, [])
    expect(markPendingSelection(segs, null)).toEqual([
      { start: 0, end: 10, codingIds: [], isPending: false }
    ])
  })

  it('splits uncoded text at pending boundaries', () => {
    const segs = computeSegments(10, [])
    expect(markPendingSelection(segs, { start: 3, end: 7 })).toEqual([
      { start: 0, end: 3, codingIds: [], isPending: false },
      { start: 3, end: 7, codingIds: [], isPending: true },
      { start: 7, end: 10, codingIds: [], isPending: false }
    ])
  })

  it('marks overlap inside an existing coded segment', () => {
    const segs = computeSegments(10, [coding(1, 0, 6)])
    expect(markPendingSelection(segs, { start: 2, end: 4 })).toEqual([
      { start: 0, end: 2, codingIds: [1], isPending: false },
      { start: 2, end: 4, codingIds: [1], isPending: true },
      { start: 4, end: 6, codingIds: [1], isPending: false },
      { start: 6, end: 10, codingIds: [], isPending: false }
    ])
  })
})
