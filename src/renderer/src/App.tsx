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
    })
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!(e.ctrlKey || e.metaKey)) return
      const s = useZoomStore.getState()
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        s.zoomIn()
      } else if (e.key === '-') {
        e.preventDefault()
        s.zoomOut()
      } else if (e.key === '0') {
        e.preventDefault()
        s.resetZoom()
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
