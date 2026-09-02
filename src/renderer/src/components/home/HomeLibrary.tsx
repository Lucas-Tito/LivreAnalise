import { useEffect, useState } from 'react'
import {
  FilePlus2,
  FolderOpen,
  Clock,
  BookText,
  FileInput,
  AudioLines,
  FolderOpen as OpenIcon,
  Pencil,
  Trash2,
  Info,
  Linkedin,
  Github
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { formatCount } from '@/lib/utils'
import type { RecentProjectWithStats } from '@shared/types'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { SimplePromptDialog } from '@/components/workspace/SimplePromptDialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'

function formatProjectStats(stats: {
  documents: number
  quotes: number
  codesUsed: number
}): string {
  return [
    formatCount(stats.documents, 'documento', 'documentos'),
    formatCount(stats.quotes, 'citação', 'citações'),
    formatCount(stats.codesUsed, 'código usado', 'códigos usados')
  ].join(' · ')
}

interface Props {
  onTranscribe: () => void
}

export function HomeLibrary({ onTranscribe }: Props): JSX.Element {
  const recents = useAppStore((s) => s.recents)
  const loadRecents = useAppStore((s) => s.loadRecents)
  const createProject = useAppStore((s) => s.createProject)
  const openProject = useAppStore((s) => s.openProject)
  const openRecent = useAppStore((s) => s.openRecent)
  const importQdpxAsProject = useAppStore((s) => s.importQdpxAsProject)
  const renameProject = useAppStore((s) => s.renameProject)
  const trashProject = useAppStore((s) => s.trashProject)
  const [renaming, setRenaming] = useState<RecentProjectWithStats | null>(null)

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
              Codificação qualitativa de documentos
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" className="gap-1.5 px-3 text-muted-foreground">
                  <Info className="h-4 w-4" />
                  Créditos
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64">
                <p className="text-xs text-muted-foreground">Feito por</p>
                <p className="mt-0.5 font-medium">Lucas Tito</p>
                {/* o setWindowOpenHandler do main manda target=_blank para o
                    navegador do sistema; sem isso a janela do app navegaria
                    para o LinkedIn e não teria como voltar */}
                <div className="mt-3 space-y-1.5">
                  <a
                    href="https://www.linkedin.com/in/lucas-tito-530997211/"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors hover:border-primary hover:bg-accent"
                  >
                    <Linkedin className="h-4 w-4 shrink-0 text-primary" />
                    <span>Meu LinkedIn</span>
                  </a>
                  <a
                    href="https://github.com/Lucas-Tito/LivreAnalise"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors hover:border-primary hover:bg-accent"
                  >
                    <Github className="h-4 w-4 shrink-0 text-primary" />
                    <span>Repositório do projeto</span>
                  </a>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
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
          <button
            onClick={onTranscribe}
            className="flex flex-col items-start gap-2 rounded-lg border bg-card p-5 text-left transition-colors hover:border-primary hover:bg-accent"
          >
            <AudioLines className="h-6 w-6 text-primary" />
            <span className="font-medium">Transcrever</span>
            <span className="text-xs text-muted-foreground">
              Gera a transcrição de um áudio ou vídeo no seu computador
            </span>
          </button>
          <button
            onClick={importQdpxAsProject}
            className="flex flex-col items-start gap-2 rounded-lg border bg-card p-5 text-left transition-colors hover:border-primary hover:bg-accent"
          >
            <FileInput className="h-6 w-6 text-primary" />
            <span className="font-medium">Importar QDPX</span>
            <span className="text-xs text-muted-foreground">
              Cria um projeto novo a partir de um arquivo .qdpx
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
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                  <button
                    onClick={() => openRecent(r.path)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.path}
                      </div>
                      {r.stats && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatProjectStats(r.stats)}
                        </div>
                      )}
                    </div>
                    <span className="ml-4 shrink-0 text-xs text-muted-foreground">
                      {new Date(r.lastOpenedAt).toLocaleDateString()}
                    </span>
                  </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => openRecent(r.path)}>
                      <OpenIcon className="h-4 w-4" /> Abrir
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => setRenaming(r)}>
                      <Pencil className="h-4 w-4" /> Renomear
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        if (
                          confirm(
                            `Mover "${r.name}" para a lixeira?\n\n${r.path}\n\nO arquivo sai do lugar mas pode ser recuperado na lixeira do sistema.`
                          )
                        ) {
                          trashProject(r.path)
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" /> Apagar o arquivo
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <SimplePromptDialog
        open={renaming !== null}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Renomear projeto"
        label="Nome do projeto"
        initialValue={renaming?.name ?? ''}
        onSubmit={async (name) => {
          if (!renaming) return
          const result = await renameProject(renaming.path, name)
          // o nome do projeto sempre muda; o arquivo pode nao ter acompanhado
          if (result.warning) alert(result.warning)
        }}
      />
    </div>
  )
}
