import { Moon, Sun } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useThemeStore } from '@/stores/themeStore'
import { useZoomStore, type TranscriptFont } from '@/stores/zoomStore'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const FONTES: { id: TranscriptFont; nome: string; descricao: string }[] = [
  { id: 'sans', nome: 'Sem serifa', descricao: 'A fonte padrão do sistema.' },
  { id: 'serif', nome: 'Com serifa', descricao: 'Traços nas pontas das letras, como num livro.' },
  {
    id: 'dyslexic',
    nome: 'OpenDyslexic',
    descricao:
      'Letras com base pesada e formas distintas, desenhada para reduzir a confusão entre caracteres espelhados (b/d, p/q).'
  }
]

export function SettingsDialog({ open, onOpenChange }: Props): JSX.Element {
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)
  const font = useZoomStore((s) => s.font)
  const setFont = useZoomStore((s) => s.setFont)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurações</DialogTitle>
        </DialogHeader>

        <div className="min-w-0 space-y-5">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Tema</h3>
            <div className="flex gap-2">
              <button
                onClick={() => theme === 'dark' && toggle()}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                  theme === 'light' ? 'border-primary bg-accent' : 'hover:bg-accent/50'
                )}
              >
                <Sun className="h-4 w-4" /> Claro
              </button>
              <button
                onClick={() => theme === 'light' && toggle()}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                  theme === 'dark' ? 'border-primary bg-accent' : 'hover:bg-accent/50'
                )}
              >
                <Moon className="h-4 w-4" /> Escuro
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Fonte de leitura do documento</h3>
            <ul className="space-y-1.5">
              {FONTES.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => setFont(f.id)}
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors',
                      font === f.id ? 'border-primary bg-accent' : 'hover:bg-accent/50'
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <span
                        className={cn(
                          'h-3 w-3 shrink-0 rounded-full border',
                          font === f.id && 'border-primary bg-primary'
                        )}
                      />
                      {f.nome}
                    </span>
                    <span className="pl-5 text-xs text-muted-foreground">{f.descricao}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* O tamanho não entra aqui: ele é por documento e muda enquanto se lê,
              então vive no atalho, não num diálogo que precisa ser aberto. */}
          <p className="border-t pt-3 text-xs text-muted-foreground">
            O tamanho do texto é ajustado com <kbd>Ctrl</kbd> <kbd>+</kbd> e{' '}
            <kbd>Ctrl</kbd> <kbd>−</kbd>, e volta a 100% com <kbd>Ctrl</kbd> <kbd>0</kbd>.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
