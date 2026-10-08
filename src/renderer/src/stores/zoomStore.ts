import { create } from 'zustand'

const ZOOM_KEY = 'livreanalise-zoom'
const FONT_KEY = 'livreanalise-transcript-font'

export type TranscriptFont = 'sans' | 'serif' | 'dyslexic'

export const ZOOM_MIN = 0.8
export const ZOOM_MAX = 2.0
export const ZOOM_STEP = 0.1

function readZoom(): number {
  const stored = localStorage.getItem(ZOOM_KEY)
  // Number(null) e Number('') são 0, não NaN: sem esse guard, instalação
  // nova abriria com o clamp mínimo (0.8) em vez de 100%.
  if (stored == null || stored === '') return 1
  const raw = Number(stored)
  if (!Number.isFinite(raw) || raw <= 0) return 1
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, raw))
}

function readFont(): TranscriptFont {
  const stored = localStorage.getItem(FONT_KEY)
  if (stored === 'serif' || stored === 'dyslexic') return stored
  return 'sans'
}

const TRANSCRIPT_FONTS: Record<TranscriptFont, string> = {
  sans: 'system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  // OpenDyslexic: letras com base pesada e formas distintas, desenhada para
  // reduzir confusão entre caracteres espelhados (b/d, p/q).
  dyslexic: "'OpenDyslexic', system-ui, sans-serif"
}

function applyFont(font: TranscriptFont): void {
  const root = document.documentElement
  root.style.setProperty('--transcript-font', TRANSCRIPT_FONTS[font])
  // o menu da janela nao tem como ler o localStorage: so o renderer sabe qual
  // fonte esta valendo, entao e ele quem mantem o radio marcado
  try {
    window.api?.view?.notifyFont(font)
  } catch {
    // preload indisponivel (teste, por exemplo): o menu so nao marca
  }
}

// Fora do React de proposito: roda no import, antes da primeira pintura. No
// efeito passivo do App quem escolheu OpenDyslexic via um quadro com a fonte
// errada -- justamente quem mais precisa da fonte certa.
applyFont(readFont())

interface ZoomState {
  zoom: number
  font: TranscriptFont
  init: () => void
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  setFont: (font: TranscriptFont) => void
}

export const useZoomStore = create<ZoomState>((set, get) => ({
  zoom: readZoom(),
  font: readFont(),
  init: () => {
    const zoom = readZoom()
    const font = readFont()
    applyFont(font)
    set({ zoom, font })
  },
  setZoom: (zoom) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 10) / 10))
    localStorage.setItem(ZOOM_KEY, String(clamped))
    applyFont(get().font)
    set({ zoom: clamped })
  },
  zoomIn: () => get().setZoom(get().zoom + ZOOM_STEP),
  zoomOut: () => get().setZoom(get().zoom - ZOOM_STEP),
  resetZoom: () => get().setZoom(1),
  setFont: (font) => {
    localStorage.setItem(FONT_KEY, font)
    applyFont(font)
    set({ font })
  }
}))
