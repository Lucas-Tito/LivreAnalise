import { useLayoutEffect, type RefObject } from 'react'

export interface ScrollPosition {
  top: number
  left: number
}

// A memória pertence ao painel pai, que continua montado durante a navegação.
// Não mantém editores ocultos nem listeners de atalhos de uma aba inativa.
export function useScrollMemory(
  ref: RefObject<HTMLElement | null>,
  memory: RefObject<ScrollPosition> | undefined,
  visible = true
): void {
  useLayoutEffect(() => {
    const element = ref.current
    if (!visible || !element || !memory) return
    element.scrollTop = memory.current.top
    element.scrollLeft = memory.current.left
    const remember = (): void => {
      memory.current = { top: element.scrollTop, left: element.scrollLeft }
    }
    element.addEventListener('scroll', remember)
    return () => {
      if (element.isConnected) remember()
      element.removeEventListener('scroll', remember)
    }
  }, [ref, memory, visible])
}
