import { describe, expect, it } from 'vitest'
import { packBarColumns } from '../src/renderer/src/lib/barLayout'

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
