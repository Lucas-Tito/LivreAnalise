import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureTranscriptViewport,
  remapTranscriptViewport,
  restoreTranscriptViewport
} from '../src/renderer/src/lib/transcriptViewport'

// Simula a geometria de linhas quebradas, sem depender de um navegador:
// cada modo pode ter uma largura diferente e, portanto, outra rolagem.
function layout(charsPerLine: number, scrollTop = 0, boundaries = [0, 40, 100, 200]) {
  const container = {
    scrollTop,
    scrollHeight: Math.ceil(boundaries.at(-1)! / charsPerLine) * 20,
    clientHeight: 60,
    getBoundingClientRect: () => ({ top: 100, bottom: 160 })
  }
  const spans = boundaries.slice(0, -1).map((start, index) => ({
    dataset: { pos: String(start) },
    childNodes: [{ nodeType: 3, length: boundaries[index + 1] - start, start }]
  }))
  const content = { querySelectorAll: () => spans }
  vi.stubGlobal('document', {
    createRange: () => {
      let node: { start: number; length: number }
      let start = 0
      let end = 0
      return {
        selectNodeContents: (value: typeof node) => { node = value; start = 0; end = node.length },
        setStart: (value: typeof node, offset: number) => { node = value; start = offset },
        setEnd: (value: typeof node, offset: number) => { node = value; end = offset },
        getBoundingClientRect: () => {
          const top = 100 - container.scrollTop + Math.floor((node.start + start) / charsPerLine) * 20
          const bottom = 100 - container.scrollTop + (Math.floor((node.start + end - 1) / charsPerLine) + 1) * 20
          return { top, bottom, height: bottom - top }
        }
      }
    }
  })
  return {
    container: container as unknown as HTMLElement,
    content: content as unknown as HTMLElement
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('posição da transcrição entre modos', () => {
  it('guarda a primeira linha visível dentro de um segmento, inclusive parcialmente cortada', () => {
    const view = layout(20, 87)
    expect(captureTranscriptViewport(view.container, view.content)).toEqual({
      position: 80,
      top: -7,
      scrollFraction: 87 / 140
    })
  })

  it('preserva o trecho e o deslocamento visual quando a largura muda', () => {
    const reading = layout(20, 87)
    const viewport = captureTranscriptViewport(reading.container, reading.content)
    const editor = layout(10)
    restoreTranscriptViewport(editor.container, editor.content, viewport)
    expect(editor.container.scrollTop).toBe(167)
    expect(captureTranscriptViewport(editor.container, editor.content).position).toBe(80)
  })

  it('restaura a posição ao voltar para a visualização mesmo com a rolagem já deslocada', () => {
    const editor = layout(10, 167)
    const viewport = captureTranscriptViewport(editor.container, editor.content)
    const reading = layout(20, 30)
    restoreTranscriptViewport(reading.container, reading.content, viewport)
    expect(reading.container.scrollTop).toBe(87)
  })

  it('aceita documentos vazios', () => {
    const empty = layout(20, 0, [0])
    const viewport = captureTranscriptViewport(empty.container, empty.content)
    restoreTranscriptViewport(empty.container, empty.content, viewport)
    expect(empty.container.scrollTop).toBe(0)
  })
})

describe('posição ao cancelar alterações no texto', () => {
  const original = 'a'.repeat(40) + 'b'.repeat(60) + 'c'.repeat(100)

  it('restaura o mesmo trecho depois de descartar uma inserção anterior a ele', () => {
    const draft = 'x'.repeat(40) + original
    const editor = layout(10, 167, [0, draft.length])
    const viewport = captureTranscriptViewport(editor.container, editor.content)
    const mapped = remapTranscriptViewport(viewport, draft, original)
    const reading = layout(20)
    restoreTranscriptViewport(reading.container, reading.content, mapped)
    expect(mapped.position).toBe(40)
    expect(reading.container.scrollTop).toBe(47)
    expect(captureTranscriptViewport(reading.container, reading.content).position).toBe(40)
  })

  it('restaura o mesmo trecho depois de descartar uma exclusão anterior a ele', () => {
    const draft = original.slice(40)
    const editor = layout(10, 167, [0, draft.length])
    const viewport = captureTranscriptViewport(editor.container, editor.content)
    const mapped = remapTranscriptViewport(viewport, draft, original)
    const reading = layout(20)
    restoreTranscriptViewport(reading.container, reading.content, mapped)
    expect(mapped.position).toBe(120)
    expect(reading.container.scrollTop).toBe(127)
    expect(captureTranscriptViewport(reading.container, reading.content).position).toBe(120)
  })

  it('mantém a posição quando a alteração está depois do trecho visível', () => {
    const viewport = { position: 20, top: -7, scrollFraction: 0.2 }
    expect(remapTranscriptViewport(viewport, original + 'novo final', original)).toEqual(viewport)
  })

  it('usa o início da região alterada quando o trecho visível era texto inserido', () => {
    const draft = original.slice(0, 40) + 'x'.repeat(100) + original.slice(40)
    const viewport = { position: 80, top: -7, scrollFraction: 0.2 }
    expect(remapTranscriptViewport(viewport, draft, original)).toEqual({ ...viewport, position: 40 })
  })

  it('usa o início da região alterada quando o trecho visível foi substituído', () => {
    const draft = original.slice(0, 40) + 'x'.repeat(30) + original.slice(100)
    const viewport = { position: 50, top: 0, scrollFraction: 0.2 }
    expect(remapTranscriptViewport(viewport, draft, original).position).toBe(40)
  })

  it('mapeia o início do trecho sobrevivente quando o texto anterior foi apagado', () => {
    const viewport = { position: 0, top: 0, scrollFraction: 0 }
    expect(remapTranscriptViewport(viewport, original.slice(40), original).position).toBe(40)
  })

  it('volta ao início ao cancelar a exclusão de todo o documento', () => {
    const viewport = { position: 0, top: 0, scrollFraction: 0 }
    expect(remapTranscriptViewport(viewport, '', original).position).toBe(0)
  })

  it('aceita o cancelamento de texto inserido em um documento vazio', () => {
    const viewport = { position: 50, top: -7, scrollFraction: 0.2 }
    expect(remapTranscriptViewport(viewport, 'x'.repeat(100), '').position).toBe(0)
  })
})
