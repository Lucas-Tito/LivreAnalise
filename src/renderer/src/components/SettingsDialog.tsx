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
  { id: 'sans', nome: 'Sans', descricao: 'Fonte sem serifa' },
  { id: 'serif', nome: 'Serif', descricao: 'Fonte com serifa' },
  {
    id: 'dyslexic',
    nome: 'Dislexia',
    descricao:
      'OpenDyslexic: letras com base pesada e formas distintas, para reduzir a confusão entre caracteres espelhados (b/d, p/q)'
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
            {/* O seletor da antiga barra: as três lado a lado, com a ativa
                destacada. Com a amostra logo abaixo, a descrição de cada uma
                virava texto que ninguém lê — a letra na tela diz mais. */}
            <div className="flex items-center gap-0.5 rounded-md border p-0.5">
              {FONTES.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFont(f.id)}
                  title={f.descricao}
                  className={cn(
                    'flex-1 rounded px-2 py-1.5 text-sm transition-colors',
                    font === f.id
                      ? 'bg-accent font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-accent/50'
                  )}
                >
                  {f.nome}
                </button>
              ))}
            </div>

            {/* Amostra com a fonte escolhida: ver a letra é o que decide a
                escolha, e comparar três nomes não diz nada. Usa a mesma
                variável CSS que a transcrição (`--transcript-font`). */}
            <div
              className="rounded-md border bg-muted/30 p-3 text-sm leading-7"
              style={{ fontFamily: 'var(--transcript-font)' }}
            >
              <p>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                eiusmod tempor incididunt ut labore et dolore magna aliqua.
              </p>
            </div>
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
