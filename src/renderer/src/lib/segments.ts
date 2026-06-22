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
