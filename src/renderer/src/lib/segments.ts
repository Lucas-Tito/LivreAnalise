import type { Coding } from '@shared/types'

export interface Segment {
  start: number
  end: number
  codingIds: number[]
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
