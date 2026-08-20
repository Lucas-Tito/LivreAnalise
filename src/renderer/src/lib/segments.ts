import type { Coding } from '@shared/types'

export interface Segment {
  start: number
  end: number
  codingIds: number[]
}

export interface DisplaySegment extends Segment {
  isPending: boolean
}

export function computeSegments(length: number, codings: Coding[]): Segment[] {
  if (length === 0) return []
  const boundaries = new Set<number>([0, length])
  for (const c of codings) {
    if (c.startPos >= 0 && c.startPos <= length) boundaries.add(c.startPos)
    if (c.endPos >= 0 && c.endPos <= length) boundaries.add(c.endPos)
  }
  const sorted = Array.from(boundaries).sort((a, b) => a - b)
  const segments: Segment[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]
    const end = sorted[i + 1]
    if (end <= start) continue
    const codingIds = codings
      .filter((c) => c.startPos <= start && c.endPos >= end)
      .map((c) => c.id)
    segments.push({ start, end, codingIds })
  }
  return segments
}

export function markPendingSelection(
  segments: Segment[],
  pending: { start: number; end: number } | null
): DisplaySegment[] {
  if (!pending) {
    return segments.map((s) => ({ ...s, isPending: false }))
  }

  const result: DisplaySegment[] = []
  for (const seg of segments) {
    if (seg.end <= pending.start || seg.start >= pending.end) {
      result.push({ ...seg, isPending: false })
      continue
    }

    const splits: Array<{ start: number; end: number; isPending: boolean }> = []
    if (seg.start < pending.start) {
      splits.push({ start: seg.start, end: pending.start, isPending: false })
    }
    splits.push({
      start: Math.max(seg.start, pending.start),
      end: Math.min(seg.end, pending.end),
      isPending: true
    })
    if (seg.end > pending.end) {
      splits.push({ start: pending.end, end: seg.end, isPending: false })
    }

    for (const split of splits) {
      if (split.end > split.start) {
        result.push({
          start: split.start,
          end: split.end,
          codingIds: seg.codingIds,
          isPending: split.isPending
        })
      }
    }
  }
  return result
}

export interface LineSpan {
  start: number
  end: number
  text: string
  codingIds: number[]
  isPending: boolean
}

export interface LineRow {
  index: number
  start: number
  end: number
  spans: LineSpan[]
}

export function buildLineRows(
  text: string,
  segments: DisplaySegment[]
): LineRow[] {
  const lines = text.split('\n')
  const rows: LineRow[] = []
  let start = 0
  for (let index = 0; index < lines.length; index++) {
    const end = start + lines[index].length
    const spans: LineSpan[] = []
    for (const seg of segments) {
      if (seg.end <= start || seg.start >= end) continue
      const spanStart = Math.max(seg.start, start)
      const spanEnd = Math.min(seg.end, end)
      const spanText = text.slice(spanStart, spanEnd)
      if (!spanText) continue
      spans.push({
        start: spanStart,
        end: spanEnd,
        text: spanText,
        codingIds: seg.codingIds,
        isPending: seg.isPending
      })
    }
    rows.push({ index, start, end, spans })
    start = end + 1
  }
  return rows
}

export function anchorPositions(rows: LineRow[]): number[] {
  const positions: number[] = []
  for (const row of rows) {
    if (row.spans.length === 0) {
      positions.push(row.start)
      continue
    }
    for (const span of row.spans) positions.push(span.start)
  }
  return positions
}

// Uma codificacao pode comecar numa posicao sem glifo (a quebra de linha) e
// portanto sem span renderizado. Nesse caso a etiqueta ancora no proximo span,
// que e onde o texto codificado realmente comeca.
export function resolveAnchorPos(
  startPos: number,
  anchors: number[]
): number | null {
  if (anchors.length === 0) return null
  if (anchors.includes(startPos)) return startPos
  let next: number | null = null
  let previous: number | null = null
  for (const pos of anchors) {
    if (pos > startPos && (next === null || pos < next)) next = pos
    if (pos < startPos && (previous === null || pos > previous)) previous = pos
  }
  return next ?? previous
}
