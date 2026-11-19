import { describe, expect, it } from 'vitest'
import { distributeExcerptBars, packBarColumns } from '../src/renderer/src/lib/barLayout'

function layout(tops: number[], minColumns = 1) {
  return packBarColumns(tops.map((top, id) => ({ id, top })), minColumns)
}

describe('packBarColumns', () => {
  it('expands an isolated label across columns reserved elsewhere in the document', () => {
    const result = layout([0, 0, 0, 100])

    expect(result.columnCount).toBe(3)
    expect(result.bars[3]).toMatchObject({ column: 0, columnSpan: 3 })
  })

  it('keeps simultaneous labels side by side', () => {
    const result = layout([0, 0, 0])

    expect(result.bars.map(({ column, columnSpan }) => ({ column, columnSpan })))
      .toEqual([
        { column: 0, columnSpan: 1 },
        { column: 1, columnSpan: 1 },
        { column: 2, columnSpan: 1 }
      ])
  })

  it('expands through an empty column but stops before the next occupied column', () => {
    const result = layout([0, 0, 10, 24])

    expect(result.bars[3]).toMatchObject({ column: 0, columnSpan: 2 })
  })

  it('respects a neighboring label that starts above the expanding label', () => {
    const result = layout([0, 10, 24])

    expect(result.bars[2]).toMatchObject({ column: 0, columnSpan: 1 })
  })

  it('respects a neighboring label that starts below the expanding label', () => {
    const result = layout([0, 0, 24, 30])

    expect(result.bars[2]).toMatchObject({ column: 0, columnSpan: 1 })
  })

  it('allows expansion when the neighboring label ends exactly at its start', () => {
    const result = layout([0, 0, 24])

    expect(result.bars[2]).toMatchObject({ column: 0, columnSpan: 2 })
  })

  it('uses empty columns retained to stabilize the transcript width', () => {
    const result = layout([100], 4)

    expect(result.columnCount).toBe(4)
    expect(result.bars[0]).toMatchObject({ column: 0, columnSpan: 4 })
  })

  it.each([0.7, 1, 1.3, 2])('keeps expanded labels disjoint at position scale %s', (scale) => {
    const result = layout([100, 0, 12, 0, 24, 36, 60, 60, 72].map((top) => top * scale), 4)

    for (let i = 0; i < result.bars.length; i++) {
      const bar = result.bars[i]
      expect(bar.columnSpan).toBeGreaterThanOrEqual(1)
      expect(bar.column + bar.columnSpan).toBeLessThanOrEqual(result.columnCount)
      for (const other of result.bars.slice(i + 1)) {
        const verticallyDisjoint = bar.top + 24 <= other.top || other.top + 24 <= bar.top
        const horizontallyDisjoint =
          bar.column + bar.columnSpan <= other.column ||
          other.column + other.columnSpan <= bar.column
        expect(verticallyDisjoint || horizontallyDisjoint).toBe(true)
      }
    }
  })
})

describe('distributeExcerptBars', () => {
  it('centers an isolated label in the visible lines of its excerpt', () => {
    expect(distributeExcerptBars([{ item: 'a', lineTops: [10, 38, 66] }]))
      .toEqual([{ items: ['a'], top: 38 }])
  })

  it('uses the exact midpoint for an isolated excerpt with an even number of lines', () => {
    expect(distributeExcerptBars([{ item: 'a', lineTops: [10, 38] }]))
      .toEqual([{ items: ['a'], top: 24 }])
  })

  it('distributes multiline codes around the middle without creating columns', () => {
    const result = distributeExcerptBars(['a', 'b', 'c'].map((item) => ({ item, lineTops: [10, 38, 66, 94, 122] })))
    expect(result.map((bar) => bar.top).sort((a, b) => a - b)).toEqual([38, 66, 94])
    expect(packBarColumns(result).columnCount).toBe(1)
  })

  it('reserves short excerpts first and respects each excerpt bounds', () => {
    const excerpts = [
      { item: 'long', lineTops: [10, 38, 66, 94, 122] },
      { item: 'short', lineTops: [66] },
      { item: 'overlap', lineTops: [38, 66] }
    ]
    const result = distributeExcerptBars(excerpts)
    expect(packBarColumns(result).columnCount).toBe(1)
    for (const bar of result) {
      for (const item of bar.items) {
        const tops = excerpts.find((e) => e.item === item)!.lineTops
        expect(bar.top).toBeGreaterThanOrEqual(Math.min(...tops))
        expect(bar.top).toBeLessThanOrEqual(Math.max(...tops))
      }
    }
  })

  it('allows side-by-side labels only for single-line excerpts', () => {
    const result = distributeExcerptBars(['a', 'b'].map((item) => ({ item, lineTops: [10] })))
    expect(result).toHaveLength(2)
    expect(packBarColumns(result).columnCount).toBe(2)
  })

  it('groups dense multiline labels instead of placing them outside their excerpts', () => {
    const result = distributeExcerptBars(['a', 'b', 'c', 'd'].map((item) => ({ item, lineTops: [10, 38] })))
    expect(result).toHaveLength(2)
    expect(result.flatMap((bar) => bar.items).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(packBarColumns(result).columnCount).toBe(1)
  })

  it('groups occupied single-line labels when a multiline excerpt has no free line', () => {
    const result = distributeExcerptBars([
      { item: 'a', lineTops: [10] }, { item: 'b', lineTops: [10] },
      { item: 'c', lineTops: [38] }, { item: 'multi', lineTops: [10, 38] }
    ])
    expect(result.find((bar) => bar.top === 10)?.items).toEqual(['a', 'b', 'multi'])
    expect(packBarColumns(result).columnCount).toBe(1)
  })

  it('ignores empty geometry and deduplicates fragment rects on the same line', () => {
    expect(distributeExcerptBars([
      { item: 'empty', lineTops: [] }, { item: 'a', lineTops: [10.1, 10.2] }
    ])).toEqual([{ items: ['a'], top: 10 }])
  })

  it('uses the actual label height when packing zoomed-out lines', () => {
    expect(packBarColumns([{ top: 10 }, { top: 30 }], 1, 20).columnCount).toBe(1)
  })

  it('reserves single-line excerpts split into duplicate fragment rects first', () => {
    // Notas e busca dividem a linha em vários spans: os fragmentos repetidos
    // não podem fazer o trecho curto perder a vez para o multilinha.
    const result = distributeExcerptBars([
      { item: 'short', lineTops: [10, 10, 10] },
      { item: 'multiline', lineTops: [10, 38] }
    ])
    expect(result).toHaveLength(2)
    expect(result.map((bar) => bar.top).sort((a, b) => a - b)).toEqual([10, 38])
  })
})
