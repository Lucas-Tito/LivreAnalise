import { type JSX, type RefObject, useContext, useEffect, useRef, useState } from 'react'
import { FileText, FilePlus, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { DocumentNameEditor } from './DocumentNameEditor'
import { cn } from '@/lib/utils'
import { casaBusca } from '@shared/busca'
import { SearchButton, SearchField } from './SearchField'
import type { DocumentRecord } from '@shared/types'
import { useAsyncAction } from '@/lib/useAsyncAction'
import { useScrollMemory, type ScrollPosition } from '@/lib/useScrollMemory'
import { hasKeyboardLayer, isTypingTarget, matchesCommand } from '@/lib/keyboard'
import { WorkspaceActionsContext } from '@/lib/workspaceActions'

export function documentToRename(origin: EventTarget | null): DocumentRecord | undefined {
  const { documents, currentDocument } = useAppStore.getState()
  const focusedId = origin instanceof HTMLElement ? origin.closest<HTMLElement>('[data-document-id]')?.dataset.documentId : undefined
  return documents.find((doc) => doc.id === (focusedId ? Number(focusedId) : currentDocument?.id))
}

export function DocumentsPanel({ scrollPosition, renameRequested, onRenameHandled }: {
  scrollPosition?: RefObject<ScrollPosition>
  renameRequested?: DocumentRecord | null
  onRenameHandled?: () => void
} = {}): JSX.Element {
  const workspace = useContext(WorkspaceActionsContext)
  const scrollRef = useRef<HTMLDivElement>(null)
  useScrollMemory(scrollRef, scrollPosition)
  const documents = useAppStore((s) => s.documents)
  const currentDocument = useAppStore((s) => s.currentDocument)
  const selectDocument = useAppStore((s) => s.selectDocument)
  const importDocuments = useAppStore((s) => s.importDocuments)
  const renameDocument = useAppStore((s) => s.renameDocument)
  const deleteDocument = useAppStore((s) => s.deleteDocument)
  const busy = useAppStore((s) => s.busy)
  const { working, error, run } = useAsyncAction()

  const [renaming, setRenaming] = useState<DocumentRecord | null>(null)
  const renamingRef = useRef<DocumentRecord | null>(null)
  const renameFromMenu = useRef<DocumentRecord | null>(null)
  const documentButtons = useRef(new Map<number, HTMLButtonElement>())
  const focusAfterRename = useRef<number | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [termo, setTermo] = useState('')
  const fecharBusca = (): void => {
    setBuscaAberta(false)
    setTermo('')
  }
  // Não desmontar um rascunho só porque o filtro deixou de casar com o nome.
  const visiveis = documents.filter((doc) => doc.id === renaming?.id || casaBusca(doc.name, termo))

  const startRenaming = async (doc: DocumentRecord): Promise<void> => {
    if (renamingRef.current?.id === doc.id) return
    const leave = useAppStore.getState().sairDaRenomeacao
    if (leave && !(await leave())) return
    renamingRef.current = doc
    setRenaming(doc)
  }

  useEffect(() => {
    if (!renaming && focusAfterRename.current != null) {
      const target = documentButtons.current.get(focusAfterRename.current) ?? searchInputRef.current
      target?.focus()
      focusAfterRename.current = null
    }
  }, [renaming])

  useEffect(() => {
    if (!renameRequested) return
    void startRenaming(renameRequested)
    onRenameHandled?.()
  }, [renameRequested, onRenameHandled])

  useEffect(() => {
    if (workspace && onRenameHandled) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || event.repeat ||
          !matchesCommand(event, 'renameDocument') || isTypingTarget(event.target) || hasKeyboardLayer()) return
      const doc = documentToRename(event.target)
      if (!doc) return
      event.preventDefault()
      void startRenaming(doc)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [workspace, onRenameHandled])

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b p-2">
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="secondary"
            className="min-w-0 flex-1"
            data-focus-key="documents-import"
            disabled={busy || working}
            onClick={() => void run(importDocuments)}
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
            inputRef={searchInputRef}
            value={termo}
            onChange={setTermo}
            onClose={fecharBusca}
            placeholder="Nome do documento"
          />
        )}
      </div>
      {error && <p role="alert" className="p-2 text-xs text-destructive">{error}</p>}
      <div ref={scrollRef} className="flex-1 overflow-auto p-1">
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
              <li key={doc.id} data-document-id={doc.id}>
                <div
                  className={cn(
                    'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                    currentDocument?.id === doc.id
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50'
                  )}
                >
                  {renaming?.id === doc.id ? <>
                    <FileText className="h-4 w-4 shrink-0 self-start mt-1.5 text-muted-foreground" />
                    <DocumentNameEditor key={doc.id} initialName={renaming.name}
                      write={(name, historyGroup) => renameDocument(doc.id, name, historyGroup)}
                      onClose={(restoreFocus) => {
                        if (restoreFocus) focusAfterRename.current = doc.id
                        renamingRef.current = null
                        setRenaming(null)
                      }} />
                  </> : <button
                     data-focus-key={`document-row-${doc.id}`}
                    ref={(button) => {
                      if (button) documentButtons.current.set(doc.id, button)
                      else documentButtons.current.delete(doc.id)
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    title={`${doc.name} (F2 para renomear)`}
                    aria-keyshortcuts="F2"
                    onClick={() => void run(() => selectDocument(doc.id))}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{doc.name}</span>
                  </button>}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                       <button data-focus-key={`document-actions-${doc.id}`} aria-label={`Ações de ${doc.name}`} className="rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onCloseAutoFocus={(e) => {
                      // Esperar o menu liberar o foco antes de montar o campo.
                      const requested = renameFromMenu.current
                      if (requested) {
                        e.preventDefault()
                        renameFromMenu.current = null
                        void startRenaming(requested)
                      }
                    }}>
                      <DropdownMenuItem onSelect={() => { renameFromMenu.current = doc }}>
                        <Pencil className="h-4 w-4" /> Renomear <span className="ml-auto text-xs text-muted-foreground">F2</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          if (
                            confirm(
                              `Excluir "${doc.name}" e todas as suas citações?`
                            )
                          ) {
                            void run(() => deleteDocument(doc.id))
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
    </div>
  )
}
