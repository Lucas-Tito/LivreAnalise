export interface SpanCoding {
  id: number
  startPos: number
  endPos: number
}

export function spansTouchOrOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

export function findConnectedCodings(
  existing: SpanCoding[],
  startPos: number,
  endPos: number
): { ids: number[]; start: number; end: number } {
  let start = startPos
  let end = endPos
  const merged = new Set<number>()
  let changed = true

  while (changed) {
    changed = false
    for (const c of existing) {
      if (merged.has(c.id)) continue
      if (spansTouchOrOverlap(start, end, c.startPos, c.endPos)) {
        merged.add(c.id)
        start = Math.min(start, c.startPos)
        end = Math.max(end, c.endPos)
        changed = true
      }
    }
  }

  return { ids: Array.from(merged), start, end }
}
