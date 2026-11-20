import { diffText } from '@shared/editAdjust'

export interface TranscriptViewport {
  position: number
  top: number
  scrollFraction: number
}

export function remapTranscriptViewport(
  viewport: TranscriptViewport,
  fromText: string,
  toText: string
): TranscriptViewport {
  const diff = diffText(fromText, toText)
  if (!diff) return viewport
  let position = viewport.position
  if (fromText.length === 0) {
    position = 0
  } else if (position >= diff.oldChangeEnd) {
    position += diff.delta
  } else if (position >= diff.changeStart) {
    // O caractere visível foi descartado: volta ao início da região alterada.
    position = diff.changeStart
  }
  return { ...viewport, position: Math.max(0, Math.min(position, toText.length)) }
}

function textNode(span: HTMLElement): Text | undefined {
  return Array.from(span.childNodes).find((node) => node.nodeType === 3) as Text | undefined
}

// Guarda um caractere visível, em vez de pixels: o editor tem outra largura
// e quebra as linhas de forma diferente da visualização com etiquetas.
export function captureTranscriptViewport(
  container: HTMLElement,
  content: HTMLElement
): TranscriptViewport {
  const viewport = container.getBoundingClientRect()
  const scrollFraction = container.scrollTop / Math.max(1, container.scrollHeight - container.clientHeight)
  const range = document.createRange()
  for (const span of content.querySelectorAll<HTMLElement>('[data-pos]')) {
    const node = textNode(span)
    if (!node?.length) continue
    range.selectNodeContents(node)
    if (range.getBoundingClientRect().bottom <= viewport.top) continue
    // Busca a primeira linha visível mesmo dentro de um span muito longo.
    let low = 0
    let high = node.length - 1
    while (low < high) {
      const mid = Math.floor((low + high) / 2)
      range.setStart(node, mid)
      range.setEnd(node, mid + 1)
      if (range.getBoundingClientRect().bottom <= viewport.top) low = mid + 1
      else high = mid
    }
    range.setStart(node, low)
    range.setEnd(node, low + 1)
    const rect = range.getBoundingClientRect()
    if (rect.height === 0) continue
    return { position: Number(span.dataset.pos) + low, top: rect.top - viewport.top, scrollFraction }
  }
  return { position: 0, top: 0, scrollFraction }
}

export function restoreTranscriptViewport(
  container: HTMLElement,
  content: HTMLElement,
  viewport: TranscriptViewport
): void {
  const range = document.createRange()
  // O texto pode ter encolhido ao cancelar a edição: usa o último caractere
  // disponível quando a posição guardada já não existe.
  let target: { node: Text; offset: number } | undefined
  for (const span of content.querySelectorAll<HTMLElement>('[data-pos]')) {
    const node = textNode(span)
    if (!node?.length) continue
    const start = Number(span.dataset.pos)
    if (start > viewport.position) break
    target = { node, offset: Math.min(node.length - 1, viewport.position - start) }
    if (viewport.position < start + node.length) break
  }
  if (!target) {
    container.scrollTop = viewport.scrollFraction * Math.max(0, container.scrollHeight - container.clientHeight)
    return
  }
  range.setStart(target.node, target.offset)
  range.setEnd(target.node, target.offset + 1)
  container.scrollTop += range.getBoundingClientRect().top - container.getBoundingClientRect().top - viewport.top
}
