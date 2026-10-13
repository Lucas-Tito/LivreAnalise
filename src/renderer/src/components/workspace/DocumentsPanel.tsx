import { type JSX, useState } from 'react'
import { FileText, FilePlus, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { SimplePromptDialog } from './SimplePromptDialog'
import { cn } from '@/lib/utils'
import { casaBusca } from '@shared/busca'
import { SearchButton, SearchField } from './SearchField'
import type { DocumentRecord } from '@shared/types'

export function DocumentsPanel(): JSX.Element {
  const documents = useAppStore((s) => s.documents)
  const currentDocument = useAppStore((s) => s.currentDocument)
  const selectDocument = useAppStore((s) => s.selectDocument)
  const importDocuments = useAppStore((s) => s.importDocuments)
  const renameDocument = useAppStore((s) => s.renameDocument)
  const deleteDocument = useAppStore((s) => s.deleteDocument)
  const busy = useAppStore((s) => s.busy)

  const [renaming, setRenaming] = useState<DocumentRecord | null>(null)
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [termo, setTermo] = useState('')
  const fecharBusca = (): void => {
    setBuscaAberta(false)
    setTermo('')
  }
  const visiveis = documents.filter((doc) => casaBusca(doc.name, termo))

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b p-2">
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="secondary"
            className="min-w-0 flex-1"
            disabled={busy}
            onClick={importDocuments}
          >
            <FilePlus className="h-4 w-4" /> Importar documentos
          </Button>
          <SearchButton
            active={buscaAberta}
            title="Buscar documento"
            onClick={() => (buscaAberta ? fecharBusca() : setBuscaAberta(true))}
          />
        </div>
        {buscaAberta && (
          <SearchField
            value={termo}
            onChange={setTermo}
            onClose={fecharBusca}
            placeholder="Nome do documento"
          />
        )}
      </div>
      <div className="flex-1 overflow-auto p-1">
        {documents.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            Nenhum documento importado.
          </p>
        ) : visiveis.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            Nenhum documento encontrado.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {visiveis.map((doc) => (
              <li key={doc.id}>
                <div
                  className={cn(
                    'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                    currentDocument?.id === doc.id
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50'
                  )}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => selectDocument(doc.id)}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{doc.name}</span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="opacity-0 group-hover:opacity-100">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setRenaming(doc)}>
                        <Pencil className="h-4 w-4" /> Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          if (
                            confirm(
                              `Excluir "${doc.name}" e todas as suas citações?`
                            )
                          ) {
                            deleteDocument(doc.id)
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SimplePromptDialog
        open={renaming !== null}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Renomear documento"
        label="Nome"
        initialValue={renaming?.name}
        onSubmit={(name) => renaming && renameDocument(renaming.id, name)}
      />
    </div>
  )
}
