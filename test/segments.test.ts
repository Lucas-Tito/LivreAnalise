import { describe, expect, it } from 'vitest'
import {
  anchorPositions,
  buildLineRows,
  computeSegments,
  markPendingSelection,
  resolveAnchorPos
} from '../src/shared/segments'
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

function rowsFor(text: string, list: Coding[]): ReturnType<typeof buildLineRows> {
  return buildLineRows(
    text,
    markPendingSelection(computeSegments(text.length, list), null)
  )
}

describe('buildLineRows', () => {
  it('clips a coded segment at the line boundary', () => {
    const rows = rowsFor('aa\nbb', [coding(1, 1, 4)])
    expect(rows.map((r) => r.spans.map((s) => [s.start, s.end, s.text]))).toEqual([
      [
        [0, 1, 'a'],
        [1, 2, 'a']
      ],
      [
        [3, 4, 'b'],
        [4, 5, 'b']
      ]
    ])
  })

  it('leaves an empty line without spans', () => {
    const rows = rowsFor('aa\n\nbb', [])
    expect(rows[1]).toEqual({ index: 1, start: 3, end: 3, spans: [] })
  })
})

describe('resolveAnchorPos', () => {
  it('uses the exact anchor when a span starts at the position', () => {
    expect(resolveAnchorPos(9, [0, 9, 20])).toBe(9)
  })

  it('falls back to the next anchor when no span starts at the position', () => {
    expect(resolveAnchorPos(8, [0, 9, 20])).toBe(9)
  })

  it('falls back to the previous anchor when nothing starts later', () => {
    expect(resolveAnchorPos(25, [0, 9, 20])).toBe(20)
  })

  it('returns null when there is no anchor at all', () => {
    expect(resolveAnchorPos(3, [])).toBeNull()
  })
})

describe('margin label anchors (issue #22)', () => {
  it('anchors a coding that starts on a line break to the next line', () => {
    const text = 'linha um\nlinha dois'
    const c = coding(1, 8, text.length)
    const anchors = anchorPositions(rowsFor(text, [c]))
    // no span can start on the newline itself: it has no glyph
    expect(anchors).not.toContain(8)
    expect(resolveAnchorPos(c.startPos, anchors)).toBe(9)
  })

  it('anchors every coding start in a multi-line document', () => {
    const text = 'aa\nbb\n\ncc'
    const list = [coding(1, 2, 5), coding(2, 5, 9), coding(3, 0, 2)]
    const anchors = anchorPositions(rowsFor(text, list))
    for (const c of list) {
      expect(resolveAnchorPos(c.startPos, anchors)).not.toBeNull()
    }
  })
})
