import { create } from 'zustand'

const ZOOM_KEY = 'livreanalise-zoom'
const FONT_KEY = 'livreanalise-transcript-font'

export type TranscriptFont = 'sans' | 'serif'

export const ZOOM_MIN = 0.8
export const ZOOM_MAX = 2.0
export const ZOOM_STEP = 0.1

function readZoom(): number {
  const raw = Number(localStorage.getItem(ZOOM_KEY))
  if (!Number.isFinite(raw)) return 1
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, raw))
}

function readFont(): TranscriptFont {
  return localStorage.getItem(FONT_KEY) === 'serif' ? 'serif' : 'sans'
}

function apply(zoom: number, font: TranscriptFont): void {
  const root = document.documentElement
  root.style.setProperty('--transcript-scale', String(zoom))
  root.style.setProperty(
    '--transcript-font',
    font === 'serif'
      ? 'Georgia, "Times New Roman", serif'
      : 'system-ui, sans-serif'
  )
}

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
    apply(zoom, font)
    set({ zoom, font })
  },
  setZoom: (zoom) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 10) / 10))
    localStorage.setItem(ZOOM_KEY, String(clamped))
    apply(clamped, get().font)
    set({ zoom: clamped })
  },
  zoomIn: () => get().setZoom(get().zoom + ZOOM_STEP),
  zoomOut: () => get().setZoom(get().zoom - ZOOM_STEP),
  resetZoom: () => get().setZoom(1),
  setFont: (font) => {
    localStorage.setItem(FONT_KEY, font)
    apply(get().zoom, font)
    set({ font })
  }
}))
