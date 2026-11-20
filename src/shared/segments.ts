import type { Coding } from '@shared/types'

export interface Segment {
  start: number
  end: number
  codingIds: number[]
}

export interface DisplaySegment extends Segment {
  isPending: boolean
  noteIds: number[]
  /** Indices das ocorrencias da busca que cobrem este pedaco. */
  hitIds?: number[]
}

export interface NoteAnchor {
  id: number
  start: number
  end: number
}

export function computeSegments(length: number, codings: Coding[]): Segment[] {
  if (length === 0) return []
  const boundaries = new Set<number>([0, length])
  const changes = new Map<number, { add: number[]; remove: number[] }>()
  const at = (position: number) => {
    let change = changes.get(position)
    if (!change) {
      change = { add: [], remove: [] }
      changes.set(position, change)
    }
    return change
  }
  codings.forEach((coding, index) => {
    if (coding.startPos >= 0 && coding.startPos <= length) boundaries.add(coding.startPos)
    if (coding.endPos >= 0 && coding.endPos <= length) boundaries.add(coding.endPos)
    const start = Math.max(0, coding.startPos)
    const end = Math.min(length, coding.endPos)
    if (start < end) {
      at(start).add.push(index)
      at(end).remove.push(index)
    }
  })
  const sorted = Array.from(boundaries).sort((a, b) => a - b)
  const active = new Set<number>()
  const segments: Segment[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]
    const change = changes.get(start)
    if (change) {
      for (const index of change.remove) active.delete(index)
      for (const index of change.add) active.add(index)
    }
    const codingIds = Array.from(active).sort((a, b) => a - b).map((index) => codings[index].id)
    segments.push({ start, end: sorted[i + 1], codingIds })
  }
  return segments
}

export function markPendingSelection(
  segments: Segment[],
  pending: { start: number; end: number } | null
): DisplaySegment[] {
  if (!pending) {
    return segments.map((s) => ({ ...s, isPending: false, noteIds: [] }))
  }

  const result: DisplaySegment[] = []
  for (const seg of segments) {
    if (seg.end <= pending.start || seg.start >= pending.end) {
      result.push({ ...seg, isPending: false, noteIds: [] })
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
          isPending: split.isPending,
          noteIds: []
        })
      }
    }
  }
  return result
}

/**
 * Divide os segmentos nas fronteiras das âncoras de nota, marcando os
 * sub-trechos exatamente cobertos com os ids das notas. Sem isso, o
 * sublinhado da nota cobriria o segmento inteiro (às vezes o parágrafo
 * todo) em vez de só a seleção anotada.
 */
export function markNoteAnchors(
  segments: DisplaySegment[],
  anchors: NoteAnchor[]
): DisplaySegment[] {
  return markAnchors(segments, anchors, 'noteIds')
}

// Os segmentos chegam em ordem de offset. Avance pelos limites das âncoras
// uma vez e mantenha só as que cobrem o ponto atual.
function markAnchors(
  segments: DisplaySegment[],
  anchors: NoteAnchor[],
  field: 'noteIds' | 'hitIds'
): DisplaySegment[] {
  if (anchors.length === 0) return segments
  const events: Array<{ position: number; index: number; starts: boolean }> = []
  anchors.forEach(({ start, end }, index) => {
    if (start >= end) return
    events.push({ position: start, index, starts: true }, { position: end, index, starts: false })
  })
  events.sort((a, b) => a.position - b.position)
  const active = new Set<number>()
  let cursor = 0
  const advance = (position: number): void => {
    while (cursor < events.length && events[cursor].position <= position) {
      const { index, starts } = events[cursor++]
      if (starts) active.add(index)
      else active.delete(index)
    }
  }
  const result: DisplaySegment[] = []
  for (const segment of segments) {
    advance(segment.start)
    if (active.size === 0 && (events[cursor]?.position ?? Infinity) >= segment.end) {
      result.push(segment)
      continue
    }
    let start = segment.start
    while (start < segment.end) {
      const end = Math.min(segment.end, events[cursor]?.position ?? Infinity)
      const ids = Array.from(active).sort((a, b) => a - b).map((index) => anchors[index].id)
      result.push({ ...segment, start, end, [field]: ids })
      start = end
      advance(start)
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
  noteIds: number[]
  hitIds?: number[]
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
  let first = 0
  for (let index = 0; index < lines.length; index++) {
    const end = start + lines[index].length
    const spans: LineSpan[] = []
    while (first < segments.length && segments[first].end <= start) first++
    for (let i = first; i < segments.length && segments[i].start < end; i++) {
      const seg = segments[i]
      const spanStart = Math.max(seg.start, start)
      const spanEnd = Math.min(seg.end, end)
      const spanText = text.slice(spanStart, spanEnd)
      if (!spanText) continue
      spans.push({
        start: spanStart,
        end: spanEnd,
        text: spanText,
        codingIds: seg.codingIds,
        isPending: seg.isPending,
        noteIds: seg.noteIds,
        hitIds: seg.hitIds
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

/**
 * Quebra os segmentos nas ocorrencias da busca, do mesmo jeito que
 * `markNoteAnchors` faz com as ancoras de nota. Mesma mecanica de propósito: o
 * destaque da busca tem de conviver com a cor da codificacao e com o
 * sublinhado da nota no mesmo trecho, sem nenhum deles apagar o outro.
 */
export function markSearchHits(
  segments: DisplaySegment[],
  hits: NoteAnchor[]
): DisplaySegment[] {
  return markAnchors(segments, hits, 'hitIds')
}
