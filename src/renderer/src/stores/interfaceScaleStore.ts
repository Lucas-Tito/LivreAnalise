import { create } from 'zustand'

const SCALE_KEY = 'livreanalise-interface-scale'
export const INTERFACE_SCALES = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5] as const

function readScale(): number {
  const value = Number(localStorage.getItem(SCALE_KEY))
  return INTERFACE_SCALES.some((scale) => scale === value) ? value : 1
}

function applyScale(scale: number): void {
  window.api?.view?.setInterfaceScale?.(scale)
}

// Aplica a preferência antes da primeira renderização.
applyScale(readScale())

interface InterfaceScaleState {
  scale: number
  setScale: (scale: number) => void
}

export const useInterfaceScaleStore = create<InterfaceScaleState>((set) => ({
  scale: readScale(),
  setScale: (scale) => {
    if (!INTERFACE_SCALES.some((option) => option === scale)) return
    localStorage.setItem(SCALE_KEY, String(scale))
    applyScale(scale)
    set({ scale })
  }
}))
