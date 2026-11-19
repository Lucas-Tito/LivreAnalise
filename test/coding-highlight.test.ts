import { describe, expect, it } from 'vitest'
import { codedSegmentBackground, distinctSegmentCodes, groupCodeRuns, hoveredSegmentColor, mergeLineBands, multipleCodeUnderline, noteUnderlineStyle, snapToLine } from '../src/renderer/src/lib/codingHighlight'
import { computeSegments, markNoteAnchors, markPendingSelection, markSearchHits } from '../src/shared/segments'
import type { Coding } from '../src/shared/types'

const codes = new Map([
  [1, { id: 1, name: 'Contexto', color: '#ff0000' }],
  [2, { id: 2, name: 'Experiência', color: '#0000ff' }],
  [3, { id: 3, name: 'Resultado', color: '#00ff00' }]
])
const codings: Coding[] = [
  { id: 10, codeId: 1, startPos: 0, endPos: 6, documentId: 1, guid: 'a', createdAt: '' },
  { id: 20, codeId: 2, startPos: 3, endPos: 9, documentId: 1, guid: 'b', createdAt: '' },
  { id: 30, codeId: 1, startPos: 4, endPos: 5, documentId: 1, guid: 'c', createdAt: '' }
]
const codingMap = new Map(codings.map((coding) => [coding.id, coding]))

describe('distinctSegmentCodes', () => {
  it('counts distinct codes, not repeated applications of one code', () => {
    expect(distinctSegmentCodes([10, 30], codingMap, codes)).toEqual([codes.get(1)])
    expect(distinctSegmentCodes([10, 20, 30], codingMap, codes)).toEqual([codes.get(1), codes.get(2)])
  })

  it('ignores missing codings and codes', () => {
    expect(distinctSegmentCodes([99], codingMap, codes)).toEqual([])
    expect(distinctSegmentCodes([10], codingMap, new Map())).toEqual([])
  })

  it('marks only the shared part of partially overlapping excerpts', () => {
    const segments = computeSegments(10, codings)
    const multiple = segments.filter((segment) =>
      distinctSegmentCodes(segment.codingIds, codingMap, codes).length > 1
    )
    expect(multiple.map(({ start, end }) => [start, end])).toEqual([[3, 4], [4, 5], [5, 6]])
  })

  it('preserves multiple codes when notes, search and pending selection split a segment', () => {
    const segments = markSearchHits(markNoteAnchors(
      markPendingSelection(computeSegments(10, codings), { start: 3, end: 5 }),
      [{ id: 1, start: 4, end: 6 }]
    ), [{ id: 0, start: 3, end: 6 }])
    for (const segment of segments.filter((segment) => segment.start >= 3 && segment.end <= 6)) {
      expect(distinctSegmentCodes(segment.codingIds, codingMap, codes)).toHaveLength(2)
    }
  })
})

describe('hoveredSegmentColor', () => {
  it('uses the label color over other codes throughout its excerpt', () => {
    const hover = { codingIds: [10], color: '#ff0000' }
    const segments = computeSegments(10, codings)
    for (const segment of segments) {
      expect(hoveredSegmentColor(segment.codingIds, hover))
        .toBe(segment.start < 6 ? '#ff0000' : undefined)
    }
  })

  it('supports grouped labels and restores the original appearance on leave', () => {
    expect(hoveredSegmentColor([20], { codingIds: [10, 20], color: '#ff0000' })).toBe('#ff0000')
    expect(hoveredSegmentColor([10, 20], null)).toBeUndefined()
    expect(hoveredSegmentColor([30], { codingIds: [10], color: '#ff0000' })).toBeUndefined()
  })
})

describe('noteUnderlineStyle', () => {
  it('omits decoration when there is no note', () => {
    expect(noteUnderlineStyle(false, false)).toEqual({})
    expect(noteUnderlineStyle(false, true)).toEqual({})
  })

  it('keeps the note underline clear of the code band', () => {
    // Sem código, o pontilhado fica junto ao texto; com código, desce para
    // não cair em cima da faixa colorida (o defeito da interface).
    expect(noteUnderlineStyle(true, false)).toMatchObject({
      textDecorationLine: 'underline',
      textDecorationStyle: 'dotted',
      textUnderlineOffset: 3
    })
    expect(noteUnderlineStyle(true, true)).toMatchObject({
      textDecorationLine: 'underline',
      textDecorationStyle: 'dotted',
      textUnderlineOffset: 6
    })
  })

  it('solidifies the underline on hover to reveal the note extent', () => {
    expect(noteUnderlineStyle(true, true, true).textDecorationStyle).toBe('solid')
    expect(noteUnderlineStyle(true, false, true).textDecorationStyle).toBe('solid')
  })
})
describe('snapToLine', () => {
  it('returns null without measured lines', () => {
    expect(snapToLine([])).toBeNull()
  })

  it('keeps single-line excerpts where they are', () => {
    expect(snapToLine([100])).toBe(100)
  })

  it('snaps the exact middle of a 2-line excerpt to the upper line', () => {
    // O meio (114) cai no vão entre as linhas: flutuar ali parecia torto.
    expect(snapToLine([100, 128])).toBe(100)
  })

  it('keeps the middle line of odd excerpts and the upper-middle of even ones', () => {
    expect(snapToLine([100, 128, 156])).toBe(128)
    expect(snapToLine([100, 128, 156, 184])).toBe(128)
  })

  it('ignores input order and duplicate rects of the same line', () => {
    expect(snapToLine([156, 100, 128, 100])).toBe(128)
  })
})
describe('codedSegmentBackground', () => {
  const base = {
    isFlash: false,
    isMultiple: false,
    ehHit: false,
    ehHitAtual: false,
    isNoteHover: false,
    base: '#ff000040'
  }
  it('keeps the code color without highlights', () => {
    expect(codedSegmentBackground(base)).toBe('#ff000040')
  })
  it('keeps the hovered code color over search and note highlights', () => {
    expect(codedSegmentBackground({ ...base, isCodingHover: true, isMultiple: true, ehHit: true, isNoteHover: true }))
      .toBe('#ff000040')
  })
  it('prioritizes the flash over everything', () => {
    expect(codedSegmentBackground({ ...base, isFlash: true, isMultiple: true, ehHit: true, isNoteHover: true }))
      .toBe('rgba(250, 204, 21, 0.35)')
  })
  it('preserves the search background over the note hover on multiple codes', () => {
    // Nesse ramo o flood da busca não entra no boxShadow: o hover apagaria a
    // distinção entre a ocorrência atual (0.45) e as demais (0.2).
    expect(codedSegmentBackground({ ...base, isMultiple: true, ehHit: true, ehHitAtual: true, isNoteHover: true }))
      .toBe('rgba(250, 204, 21, 0.45)')
    expect(codedSegmentBackground({ ...base, isMultiple: true, ehHit: true, ehHitAtual: false, isNoteHover: true }))
      .toBe('rgba(250, 204, 21, 0.2)')
  })
  it('highlights the note hover otherwise', () => {
    expect(codedSegmentBackground({ ...base, isNoteHover: true })).toBe('rgba(250, 204, 21, 0.18)')
  })
})
describe('groupCodeRuns', () => {
  it('removes multicolor bands only over hovered excerpts and restores them on leave', () => {
    const segments = [
      { start: 0, end: 2, codingIds: [10, 20] },
      { start: 2, end: 4, codingIds: [30, 20] },
      { start: 4, end: 6, codingIds: [10, 20] }
    ]
    expect(groupCodeRuns(segments, codingMap, codes, [10])).toEqual([
      { start: 2, end: 4, colors: ['#ff0000', '#0000ff'] }
    ])
    expect(groupCodeRuns(segments, codingMap, codes, [])).toEqual([
      { start: 0, end: 6, colors: ['#ff0000', '#0000ff'] }
    ])
  })
  const localCodingMap = new Map([
    [1, { codeId: 1 }],
    [2, { codeId: 2 }],
    [3, { codeId: 3 }]
  ])
  it('ignores single-code and empty segments', () => {
    expect(groupCodeRuns(
      [
        { start: 0, end: 2, codingIds: [1] },
        { start: 2, end: 4, codingIds: [] }
      ],
      localCodingMap,
      codes
    )).toEqual([])
  })
  it('merges contiguous segments with the same set in any order', () => {
    expect(groupCodeRuns(
      [
        { start: 0, end: 2, codingIds: [1, 2] },
        { start: 2, end: 5, codingIds: [2, 1] }
      ],
      localCodingMap,
      codes
    )).toEqual([{ start: 0, end: 5, colors: ['#ff0000', '#0000ff'] }])
  })
  it('splits on different sets, gaps and unknown codings', () => {
    expect(groupCodeRuns(
      [
        { start: 0, end: 2, codingIds: [1, 2] },
        { start: 2, end: 3, codingIds: [2, 3] },
        { start: 5, end: 6, codingIds: [1, 2] },
        { start: 6, end: 7, codingIds: [99, 1] }
      ],
      localCodingMap,
      codes
    )).toEqual([
      { start: 0, end: 2, colors: ['#ff0000', '#0000ff'] },
      { start: 2, end: 3, colors: ['#0000ff', '#00ff00'] },
      { start: 5, end: 6, colors: ['#ff0000', '#0000ff'] }
    ])
  })
})
describe('mergeLineBands', () => {
  it('returns no bands without rects', () => {
    expect(mergeLineBands([])).toEqual([])
  })
  it('merges contiguous fragments of one visual line into a single band', () => {
    // Dois spans lado a lado: sem fundir, o gradiente reiniciaria no meio.
    expect(mergeLineBands([
      { left: 10, top: 20, right: 60, bottom: 48 },
      { left: 60, top: 20, right: 120, bottom: 48 }
    ])).toEqual([{ left: 10, top: 45, width: 110 }])
  })
  it('opens one band per wrapped line', () => {
    expect(mergeLineBands([
      { left: 60, top: 20, right: 200, bottom: 48 },
      { left: 0, top: 48, right: 150, bottom: 76 }
    ])).toEqual([
      { left: 60, top: 45, width: 140 },
      { left: 0, top: 73, width: 150 }
    ])
  })
  it('ignores input order and drops zero-width rects', () => {
    expect(mergeLineBands([
      { left: 60, top: 20, right: 120, bottom: 48 },
      { left: 60, top: 20, right: 60, bottom: 48 },
      { left: 10, top: 20, right: 60, bottom: 48 }
    ])).toEqual([{ left: 10, top: 45, width: 110 }])
  })
  it('places taller bands with the given height', () => {
    expect(mergeLineBands([{ left: 10, top: 20, right: 60, bottom: 48 }], 6))
      .toEqual([{ left: 10, top: 42, width: 50 }])
  })
})
describe('multipleCodeUnderline', () => {
  it('leaves single-code highlighting unchanged', () => {
    expect(multipleCodeUnderline([])).toEqual({})
    expect(multipleCodeUnderline(['#ff0000'])).toEqual({})
  })

  it('alternates every code color along the whole excerpt', () => {
    // A alternância frequente diferencia "vários códigos aqui" de fronteiras:
    // cada cor repete a cada 12px ao longo do trecho.
    expect(multipleCodeUnderline([...codes.values()].map((code) => code.color))).toMatchObject({
      backgroundImage: 'repeating-linear-gradient(to right, #ff0000 0px 12px, #0000ff 12px 24px, #00ff00 24px 36px)',
      backgroundSize: '100% 3px',
      backgroundPosition: 'left bottom',
      WebkitBoxDecorationBreak: 'clone'
    })
  })

  it('alternates two and four colors with the same band width', () => {
    expect(multipleCodeUnderline(['#aa0000', '#0000bb']).backgroundImage)
      .toBe('repeating-linear-gradient(to right, #aa0000 0px 12px, #0000bb 12px 24px)')
    expect(multipleCodeUnderline(['#a', '#b', '#c', '#d']).backgroundImage)
      .toBe('repeating-linear-gradient(to right, #a 0px 12px, #b 12px 24px, #c 24px 36px, #d 36px 48px)')
  })

  it('scales bands with the given width and height', () => {
    // A faixa acompanha o zoom do transcript para continuar visível.
    expect(multipleCodeUnderline(['#aa0000', '#0000bb'], 9.6, 2.4)).toMatchObject({
      backgroundImage: 'repeating-linear-gradient(to right, #aa0000 0px 9.6px, #0000bb 9.6px 19.2px)',
      backgroundSize: '100% 2.4px'
    })
  })
})
