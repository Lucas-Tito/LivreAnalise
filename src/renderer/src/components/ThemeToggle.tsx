import { Moon, Sun } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import { Button } from '@/components/ui/button'

export function ThemeToggle(): JSX.Element {
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={toggle}
      title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  )
}
