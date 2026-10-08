import { describe, expect, it } from 'vitest'
import {
  anchorPositions,
  buildLineRows,
  computeSegments,
  markNoteAnchors,
  markPendingSelection,
  resolveAnchorPos,
  markSearchHits
} from '../src/shared/segments'
import type { DisplaySegment } from '../src/shared/segments'
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
      { start: 0, end: 10, codingIds: [], isPending: false, noteIds: [] }
    ])
  })

  it('splits uncoded text at pending boundaries', () => {
    const segs = computeSegments(10, [])
    expect(markPendingSelection(segs, { start: 3, end: 7 })).toEqual([
      { start: 0, end: 3, codingIds: [], isPending: false, noteIds: [] },
      { start: 3, end: 7, codingIds: [], isPending: true, noteIds: [] },
      { start: 7, end: 10, codingIds: [], isPending: false, noteIds: [] }
    ])
  })

  it('marks overlap inside an existing coded segment', () => {
    const segs = computeSegments(10, [coding(1, 0, 6)])
    expect(markPendingSelection(segs, { start: 2, end: 4 })).toEqual([
      { start: 0, end: 2, codingIds: [1], isPending: false, noteIds: [] },
      { start: 2, end: 4, codingIds: [1], isPending: true, noteIds: [] },
      { start: 4, end: 6, codingIds: [1], isPending: false, noteIds: [] },
      { start: 6, end: 10, codingIds: [], isPending: false, noteIds: [] }
    ])
  })
})

describe('markNoteAnchors', () => {
  function displayed(length: number, list: Coding[]): DisplaySegment[] {
    return markPendingSelection(computeSegments(length, list), null)
  }

  it('returns segments untouched when there are no anchors', () => {
    const segs = displayed(10, [])
    expect(markNoteAnchors(segs, [])).toBe(segs)
  })

  it('splits a paragraph-wide segment at the exact annotated range', () => {
    const segs = displayed(20, [])
    expect(markNoteAnchors(segs, [{ id: 7, start: 5, end: 9 }])).toEqual([
      { start: 0, end: 5, codingIds: [], isPending: false, noteIds: [] },
      { start: 5, end: 9, codingIds: [], isPending: false, noteIds: [7] },
      { start: 9, end: 20, codingIds: [], isPending: false, noteIds: [] }
    ])
  })

  it('tags segments covered by two overlapping anchors with both ids', () => {
    const segs = displayed(10, [])
    const marked = markNoteAnchors(segs, [
      { id: 1, start: 2, end: 6 },
      { id: 2, start: 4, end: 8 }
    ])
    expect(marked).toEqual([
      { start: 0, end: 2, codingIds: [], isPending: false, noteIds: [] },
      { start: 2, end: 4, codingIds: [], isPending: false, noteIds: [1] },
      { start: 4, end: 6, codingIds: [], isPending: false, noteIds: [1, 2] },
      { start: 6, end: 8, codingIds: [], isPending: false, noteIds: [2] },
      { start: 8, end: 10, codingIds: [], isPending: false, noteIds: [] }
    ])
  })

  it('keeps coding ids on the split segments', () => {
    const segs = displayed(10, [coding(1, 0, 10)])
    const marked = markNoteAnchors(segs, [{ id: 7, start: 3, end: 4 }])
    expect(marked.map((s) => [s.start, s.end, s.codingIds, s.noteIds])).toEqual([
      [0, 3, [1], []],
      [3, 4, [1], [7]],
      [4, 10, [1], []]
    ])
  })

  it('clips anchors to the segment instead of leaking outside', () => {
    const segs = displayed(10, [coding(1, 4, 6)])
    const marked = markNoteAnchors(segs, [{ id: 7, start: 0, end: 10 }])
    expect(marked.map((s) => [s.start, s.end, s.noteIds])).toEqual([
      [0, 4, [7]],
      [4, 6, [7]],
      [6, 10, [7]]
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

describe('markSearchHits', () => {
  const base = [
    { start: 0, end: 10, codingIds: [], isPending: false, noteIds: [] },
    { start: 10, end: 20, codingIds: [7], isPending: false, noteIds: [] }
  ]

  it('devolve o mesmo array quando não há busca', () => {
    expect(markSearchHits(base, [])).toBe(base)
  })

  it('quebra o segmento no limite da ocorrência', () => {
    const r = markSearchHits(base, [{ id: 0, start: 3, end: 6 }])
    expect(r.map((s) => [s.start, s.end, s.hitIds ?? []])).toEqual([
      [0, 3, []],
      [3, 6, [0]],
      [6, 10, []],
      // segmento sem ocorrência passa intacto
      [10, 20, []]
    ])
  })

  // O destaque da busca tem de conviver com a cor da codificação: quebrar não
  // pode perder o vínculo do pedaço com o código que o cobre.
  it('preserva o código do segmento ao quebrar', () => {
    const r = markSearchHits(base, [{ id: 0, start: 12, end: 15 }])
    const achado = r.find((s) => s.start === 12)
    expect(achado?.codingIds).toEqual([7])
    expect(achado?.hitIds).toEqual([0])
  })

  it('aceita ocorrência atravessando dois segmentos', () => {
    const r = markSearchHits(base, [{ id: 0, start: 8, end: 13 }])
    expect(r.filter((s) => (s.hitIds?.length ?? 0) > 0).map((s) => [s.start, s.end])).toEqual([
      [8, 10],
      [10, 13]
    ])
  })
})
