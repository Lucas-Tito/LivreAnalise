import { useEffect } from 'react'
import { useAppStore } from './stores/appStore'
import { useThemeStore } from './stores/themeStore'
import { HomeLibrary } from './components/home/HomeLibrary'
import { Workspace } from './components/workspace/Workspace'

function App(): JSX.Element {
  const project = useAppStore((s) => s.project)
  const bootstrap = useAppStore((s) => s.bootstrap)
  const initTheme = useThemeStore((s) => s.init)

  useEffect(() => {
    initTheme()
    bootstrap()
  }, [bootstrap, initTheme])

  return project ? <Workspace /> : <HomeLibrary />
}

export default App
