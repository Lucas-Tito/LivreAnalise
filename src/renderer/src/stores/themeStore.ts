import { create } from 'zustand'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'livreanalise-theme'

function readStored(): Theme {
  const value = localStorage.getItem(STORAGE_KEY)
  return value === 'light' ? 'light' : 'dark'
}

function apply(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
}

interface ThemeState {
  theme: Theme
  init: () => void
  setTheme: (theme: Theme) => void
  toggle: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readStored(),
  init: () => {
    const theme = readStored()
    apply(theme)
    set({ theme })
  },
  setTheme: (theme) => {
    localStorage.setItem(STORAGE_KEY, theme)
    apply(theme)
    set({ theme })
  },
  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  }
}))
