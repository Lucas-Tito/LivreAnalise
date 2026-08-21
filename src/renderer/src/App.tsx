import { useEffect, useState } from 'react'
import { useAppStore } from './stores/appStore'
import { useThemeStore } from './stores/themeStore'
import { HomeLibrary } from './components/home/HomeLibrary'
import { Workspace } from './components/workspace/Workspace'
import { TranscribeView } from './components/transcribe/TranscribeView'

function App(): JSX.Element {
  const project = useAppStore((s) => s.project)
  const bootstrap = useAppStore((s) => s.bootstrap)
  const initTheme = useThemeStore((s) => s.init)
  const [transcribing, setTranscribing] = useState(false)

  useEffect(() => {
    initTheme()
    bootstrap()
  }, [bootstrap, initTheme])

  if (project) return <Workspace />
  if (transcribing) return <TranscribeView onBack={() => setTranscribing(false)} />
  return <HomeLibrary onTranscribe={() => setTranscribing(true)} />
}

export default App
