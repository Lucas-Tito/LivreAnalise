import { useEffect } from 'react'
import { FilePlus2, FolderOpen, Clock, BookText } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { ThemeToggle } from '@/components/ThemeToggle'

export function HomeLibrary(): JSX.Element {
  const recents = useAppStore((s) => s.recents)
  const loadRecents = useAppStore((s) => s.loadRecents)
  const createProject = useAppStore((s) => s.createProject)
  const openProject = useAppStore((s) => s.openProject)
  const openRecent = useAppStore((s) => s.openRecent)

  useEffect(() => {
    loadRecents()
  }, [loadRecents])

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <BookText className="h-9 w-9 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">LivreAnalise</h1>
            <p className="text-sm text-muted-foreground">
              Codificacao qualitativa de transcricoes de entrevistas
            </p>
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4">
          <button
            onClick={createProject}
            className="flex flex-col items-start gap-2 rounded-lg border bg-card p-5 text-left transition-colors hover:border-primary hover:bg-accent"
          >
            <FilePlus2 className="h-6 w-6 text-primary" />
            <span className="font-medium">Novo projeto</span>
            <span className="text-xs text-muted-foreground">
              Cria um arquivo de projeto (.liva) no seu computador
            </span>
          </button>
          <button
            onClick={openProject}
            className="flex flex-col items-start gap-2 rounded-lg border bg-card p-5 text-left transition-colors hover:border-primary hover:bg-accent"
          >
            <FolderOpen className="h-6 w-6 text-primary" />
            <span className="font-medium">Abrir projeto</span>
            <span className="text-xs text-muted-foreground">
              Abre um projeto .liva existente
            </span>
          </button>
        </div>

        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Clock className="h-4 w-4" /> Projetos recentes
          </h2>
          {recents.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum projeto recente ainda.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {recents.map((r) => (
                <li key={r.path}>
                  <button
                    onClick={() => openRecent(r.path)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.path}
                      </div>
                    </div>
                    <span className="ml-4 shrink-0 text-xs text-muted-foreground">
                      {new Date(r.lastOpenedAt).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
