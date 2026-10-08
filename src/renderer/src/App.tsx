import { useEffect, useState } from 'react'
import { useAppStore } from './stores/appStore'
import { useThemeStore } from './stores/themeStore'
import { useZoomStore } from './stores/zoomStore'
import { IPC } from '@shared/ipc'
import { HomeLibrary } from './components/home/HomeLibrary'
import { Workspace } from './components/workspace/Workspace'
import { TranscribeView } from './components/transcribe/TranscribeView'

function App(): JSX.Element {
  const project = useAppStore((s) => s.project)
  const bootstrap = useAppStore((s) => s.bootstrap)
  const initTheme = useThemeStore((s) => s.init)
  const initZoom = useZoomStore((s) => s.init)
  const [transcribing, setTranscribing] = useState(false)

  useEffect(() => {
    initTheme()
    initZoom()
    bootstrap()
  }, [bootstrap, initTheme, initZoom])

  useEffect(() => {
    const off = window.api.view.onAction((action) => {
      const s = useZoomStore.getState()
      if (action === IPC.view.zoomIn) s.zoomIn()
      else if (action === IPC.view.zoomOut) s.zoomOut()
      else if (action === IPC.view.resetZoom) s.resetZoom()
      else if (action === IPC.view.fontSans) s.setFont('sans')
      else if (action === IPC.view.fontSerif) s.setFont('serif')
      else if (action === IPC.view.fontDyslexic) s.setFont('dyslexic')
    })
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      const editable = el?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA'
      if (!(e.ctrlKey || e.metaKey)) return
      const s = useZoomStore.getState()
      // O zoom vale em qualquer lugar: ele não compete com a digitação, e
      // bloqueá-lo dentro de campo de texto tirava o atalho justamente de quem
      // está editando um documento ou escrevendo uma nota.
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        s.zoomIn()
        return
      }
      if (e.key === '-') {
        e.preventDefault()
        s.zoomOut()
        return
      }
      if (e.key === '0') {
        e.preventDefault()
        s.resetZoom()
        return
      }
      // Já o desfazer não: dentro de campo de texto vale o nativo da digitação.
      if (editable) return
      if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault()
        void useAppStore.getState().undo()
      } else if ((e.key === 'y' || e.key === 'Y') || ((e.key === 'z' || e.key === 'Z') && e.shiftKey)) {
        e.preventDefault()
        void useAppStore.getState().redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  if (project) return <Workspace />
  if (transcribing) return <TranscribeView onBack={() => setTranscribing(false)} />
  return <HomeLibrary onTranscribe={() => setTranscribing(true)} />
}

export default App
