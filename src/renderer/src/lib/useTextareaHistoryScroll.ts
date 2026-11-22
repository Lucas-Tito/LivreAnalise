import { useLayoutEffect, useRef } from 'react'

interface ScrollSnapshot {
  element: HTMLElement
  top: number
  left: number
}

function restoreScroll(positions: ScrollSnapshot[]): void {
  for (const { element, top, left } of positions) {
    element.scrollTop = top
    element.scrollLeft = left
  }
}

// Mantém o undo/redo nativo (inclusive a seleção), mas não a rolagem antiga
// guardada pelo Chromium. Inclui os ancestrais: uma nota pode rolar o painel.
export function useTextareaHistoryScroll() {
  const ref = useRef<HTMLTextAreaElement>(null)
  const pending = useRef<ScrollSnapshot[] | null>(null)

  useLayoutEffect(() => {
    const textarea = ref.current
    if (!textarea) return
    const beforeInput = (event: InputEvent): void => {
      pending.current = null
      if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') return
      const positions: ScrollSnapshot[] = []
      for (let element: HTMLElement | null = textarea; element; element = element.parentElement) {
        if (element === textarea || element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) {
          positions.push({ element, top: element.scrollTop, left: element.scrollLeft })
        }
      }
      pending.current = positions
    }
    const input = (): void => {
      const positions = pending.current
      if (!positions) return
      // Não disparar render aqui: este listener roda antes do onChange do
      // React, que ainda precisa ler o valor nativo desfeito. Renderizar agora
      // reescreveria o valor antigo no campo e quebraria o histórico.
      queueMicrotask(() => {
        if (pending.current !== positions) return
        restoreScroll(positions)
        pending.current = null
      })
    }
    textarea.addEventListener('beforeinput', beforeInput)
    textarea.addEventListener('input', input)
    return () => {
      textarea.removeEventListener('beforeinput', beforeInput)
      textarea.removeEventListener('input', input)
      pending.current = null
    }
  }, [])

  useLayoutEffect(() => {
    restoreScroll(pending.current ?? [])
    pending.current = null
  })

  return ref
}
