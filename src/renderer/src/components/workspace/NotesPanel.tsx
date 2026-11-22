import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { casaBusca } from '@shared/busca'
import {
  ArrowLeft,
  FileText,
  FolderOpen,
  MapPin,
  Plus,
  StickyNote,
  Trash2,
  Unlink,
  X
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useScrollMemory } from '@/lib/useScrollMemory'
import { cn } from '@/lib/utils'
import { mensagemDeErro } from '@/lib/erros'
import { createNoteSaver, type PendingNote } from '@/lib/noteAutosave'
import type { Note } from '@shared/types'
import { useAsyncAction } from '@/lib/useAsyncAction'
import { captureFocus, hasKeyboardLayer, matchesCommand, restoreFocus, type FocusAnchor } from '@/lib/keyboard'

const AUTOSAVE_DELAY = 800

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
}

function snippet(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return ''
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

function NoteCard({
  note,
  quote,
  onOpen
}: {
  note: Note
  quote: string | null
  onOpen: () => void
}): JSX.Element {
  return (
    <button
      data-focus-key={`note-${note.id}`}
      onClick={onOpen}
      className="w-full rounded-md border bg-background px-3 py-2 text-left transition-colors hover:border-primary/50"
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-sm font-medium">
          {note.title?.trim() ? note.title : 'Sem título'}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatDate(note.updatedAt)}
        </span>
      </div>
      {quote != null && quote !== '' && (
        <p className="mt-1 border-l-2 border-primary/40 pl-2 text-xs italic text-muted-foreground">
          “{snippet(quote, 110)}”
        </p>
      )}
      {note.body.trim() !== '' && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {snippet(note.body)}
        </p>
      )}
    </button>
  )
}

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error'

function NoteEditor({ note, onBack }: { note: Note; onBack: () => void }): JSX.Element {
  const updateNote = useAppStore((s) => s.updateNote)
  const deleteNote = useAppStore((s) => s.deleteNote)
  const setNotasSujo = useAppStore((s) => s.setNotasSujo)
  const navigateToNote = useAppStore((s) => s.navigateToNote)
  const currentDocument = useAppStore((s) => s.currentDocument)
  const [pending] = useState<PendingNote>(() => {
    const state = useAppStore.getState()
    const project = state.project?.guid ?? null
    if (state.pendingNote?.id === note.id && state.pendingNote.project === project) {
      return state.pendingNote
    }
    return {
      project,
      id: note.id,
      documentId: note.documentId,
      timer: null,
      saver: createNoteSaver({ title: note.title ?? '', body: note.body }, async (draft) => {
        if ((useAppStore.getState().project?.guid ?? null) !== project) {
          throw new Error('O projeto desta nota não está aberto.')
        }
        const updated = await updateNote({
          id: note.id,
          title: draft.title.trim() === '' ? null : draft.title,
          body: draft.body
        })
        return { title: updated.title ?? '', body: updated.body }
      })
    }
  })
  const [title, setTitle] = useState(() => pending.saver.read().title)
  const [body, setBody] = useState(() => pending.saver.read().body)
  const [status, setStatus] = useState<SaveStatus>(() =>
    useAppStore.getState().pendingNote === pending ? 'dirty' : 'saved'
  )
  const [erro, setErro] = useState<string | null>(null)
  const apagadaRef = useRef(false)

  const saveNow = useCallback(async (): Promise<void> => {
    if (pending.timer) {
      clearTimeout(pending.timer)
      pending.timer = null
    }
    if (apagadaRef.current || useAppStore.getState().pendingNote !== pending) {
      setStatus('saved')
      return
    }
    setStatus('saving')
    try {
      await pending.saver.flush()
      if (useAppStore.getState().pendingNote === pending) {
        useAppStore.setState({ pendingNote: null, notesFlush: null })
        setNotasSujo(false)
      }
      setStatus('saved')
      setErro(null)
    } catch (e) {
      setStatus('error')
      setErro(mensagemDeErro(e, 'Não foi possível salvar a nota.'))
      throw e
    }
  }, [pending, setNotasSujo])

  useEffect(() => {
    if (useAppStore.getState().pendingNote !== pending) return
    // Uma remontagem da mesma nota reassume a gravação e seu estado visual.
    useAppStore.setState({ notesFlush: saveNow })
  }, [pending, saveNow])

  const closingProject = useAppStore((s) => s.closingProject)
  const handleChange = (t: string, b: string): void => {
    if (useAppStore.getState().closingProject) return
    setTitle(t)
    setBody(b)
    pending.saver.change({ title: t, body: b })
    useAppStore.setState({ pendingNote: pending, notesFlush: saveNow })
    setNotasSujo(true)
    setStatus('dirty')
    if (pending.timer) clearTimeout(pending.timer)
    pending.timer = setTimeout(() => {
      const state = useAppStore.getState()
      if (state.pendingNote === pending) void state.notesFlush?.().catch(() => undefined)
    }, AUTOSAVE_DELAY)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (!e.nativeEvent.isComposing && matchesCommand(e.nativeEvent, 'saveNote')) {
      e.preventDefault()
      void saveNow().catch(() => undefined)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!window.confirm('Apagar esta nota? O conteúdo será perdido.')) return
    if (pending.timer) clearTimeout(pending.timer)
    apagadaRef.current = true
    try {
      await deleteNote(note.id)
      if (useAppStore.getState().pendingNote === pending) {
        useAppStore.setState({ pendingNote: null, notesFlush: null })
        setNotasSujo(false)
      }
    } catch (e) {
      apagadaRef.current = false
      // sem isto o clique nao fazia nada depois de voce ja ter confirmado, e o
      // editor fechava do mesmo jeito como se tivesse apagado
      setErro(mensagemDeErro(e, 'Não foi possível apagar a nota.'))
      return
    }
    onBack()
  }

  const isExcerpt = note.scope === 'excerpt'
  const isDetached = isExcerpt && note.anchorStatus === 'detached'
  // O trecho original e o que importa aqui, nao a marca. Uma nota que foi e
  // voltou de um .qdpx perde o 'detached' (o formato nao tem esse conceito) mas
  // conserva o trecho -- e sem isto ele ficava guardado e invisivel.
  const trechoGuardado = note.anchorText
  const liveQuote =
    isExcerpt && !isDetached && note.documentId === currentDocument?.id
      ? (currentDocument?.plainText.slice(note.startPos ?? 0, note.endPos ?? 0) ?? '')
      : null

  return (
    <div className="flex h-full flex-col" onKeyDown={handleKeyDown}>
      <div className="flex items-center gap-1 border-b px-2 py-2">
        <Button size="sm" variant="ghost" onClick={() => void saveNow().then(onBack).catch(() => undefined)}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <span role="status" className="ml-auto text-[11px] text-muted-foreground">
          {status === 'saving' && 'Salvando…'}
          {status === 'saved' && 'Salvo'}
          {status === 'dirty' && 'Alterações não salvas'}
          {status === 'error' && 'Erro ao salvar. Tente Ctrl+S'}
        </span>
        <Button size="sm" variant="ghost" onClick={() => void handleDelete()} title="Apagar nota">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {erro && (
        <p className="border-b bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
          {erro}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {(isExcerpt || note.scope === 'document') && (
          <div className="mb-2 rounded-md border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
            {note.scope === 'document' ? (
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" /> Nota do documento
              </span>
            ) : isDetached ? (
              <span className="flex items-center gap-1">
                <Unlink className="h-3 w-3" /> Trecho original (desvinculado)
              </span>
            ) : (
              <span>Trecho anotado</span>
            )}
          </div>
        )}
        {(liveQuote ?? trechoGuardado) && (
          <blockquote className="mb-2 border-l-2 border-primary/40 pl-2 text-xs italic text-muted-foreground">
            “{snippet(liveQuote ?? note.anchorText ?? '', 200)}”
          </blockquote>
        )}
        {isExcerpt && !isDetached && (
          <Button
            size="sm"
            variant="outline"
            className="mb-2"
            onClick={() => navigateToNote(note.id)}
          >
            <MapPin className="h-3 w-3" /> Ir para o trecho
          </Button>
        )}
        <input
          autoFocus
          data-focus-key="note-title"
          data-area-default
          aria-label="Título da nota"
          readOnly={closingProject}
          value={title}
          onChange={(e) => handleChange(e.target.value, body)}
          placeholder="Título da nota"
          className="mb-2 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Textarea
          data-focus-key="note-body"
          aria-label="Conteúdo da nota"
          readOnly={closingProject}
          value={body}
          onChange={(e) => handleChange(title, e.target.value)}
          placeholder="Escreva o memo aqui…"
          spellCheck={false}
          className="min-h-48 w-full flex-1 rounded-md border border-input bg-transparent p-2 text-sm leading-6 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
    </div>
  )
}

export function NotesPanel({ onReturnFocus }: { onReturnFocus?: (noteId: number | null) => void } = {}): JSX.Element {
  const currentDocument = useAppStore((s) => s.currentDocument)
  const documentNotes = useAppStore((s) => s.documentNotes)
  const projectNotes = useAppStore((s) => s.projectNotes)
  const editorNoteId = useAppStore((s) => s.editorNoteId)
  const openNoteEditor = useAppStore((s) => s.openNoteEditor)
  const toggleNotesPanel = useAppStore((s) => s.toggleNotesPanel)
  const createNote = useAppStore((s) => s.createNote)
  const [erroLista, setErroLista] = useState<string | null>(null)
  const { error: navigationError, run } = useAsyncAction()
  const panel = useRef<HTMLDivElement>(null)
  const editorOrigin = useRef<{ id: number; anchor: FocusAnchor } | null>(null)
  const close = useCallback(async (): Promise<void> => {
    await toggleNotesPanel()
    onReturnFocus?.(editorNoteId)
  }, [toggleNotesPanel, onReturnFocus, editorNoteId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || !matchesCommand(event, 'cancel')) return
      // Diálogos e menus sobrepostos têm prioridade sobre o painel.
      if (hasKeyboardLayer()) return
      event.preventDefault()
      void run(close)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [run, close])

  const [filter, setFilter] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const listPosition = useRef({ top: 0, left: 0 })

  const allNotes = [...documentNotes, ...projectNotes]
  const editingNote = allNotes.find((n) => n.id === editorNoteId) ?? null
  useScrollMemory(listRef, listPosition, !editingNote)

  const open = async (id: number, origin = document.activeElement): Promise<void> => {
    const anchor = panel.current?.contains(origin) ? captureFocus(origin) : null
    await openNoteEditor(id)
    editorOrigin.current = anchor ? { id, anchor } : null
  }

  const back = (): void => {
    void run(async () => {
      await openNoteEditor(null)
      const origin = editorOrigin.current?.id === editorNoteId ? editorOrigin.current.anchor : null
      editorOrigin.current = null
      requestAnimationFrame(() => {
        if (origin) restoreFocus(origin, panel.current?.querySelector('[data-area-default]'))
        else if (onReturnFocus) onReturnFocus(editorNoteId)
        else panel.current?.querySelector<HTMLElement>('[data-area-default]')?.focus({ preventScroll: true })
      })
    })
  }

  const matches = (n: Note): boolean => {
    if (filter.trim() === '') return true
    return casaBusca(n.title ?? '', filter) || casaBusca(n.body, filter)
  }

  const docScoped = documentNotes.filter(
    (n) => n.scope === 'document' && matches(n)
  )
  const excerptAttached = documentNotes.filter(
    (n) => n.scope === 'excerpt' && n.anchorStatus === 'attached' && matches(n)
  )
  const excerptDetached = documentNotes.filter(
    (n) => n.scope === 'excerpt' && n.anchorStatus === 'detached' && matches(n)
  )
  const project = projectNotes.filter(matches)

  const quoteOf = (n: Note): string | null => {
    if (n.scope !== 'excerpt') return null
    if (n.anchorStatus === 'detached') return n.anchorText
    if (n.documentId === currentDocument?.id && n.startPos != null && n.endPos != null) {
      return currentDocument.plainText.slice(n.startPos, n.endPos)
    }
    return null
  }

  const handleCreate = async (scope: 'document' | 'project'): Promise<void> => {
    const origin = document.activeElement
    try {
      const note = await createNote(
        scope === 'document' && currentDocument
          ? { scope, documentId: currentDocument.id }
          : { scope: 'project' }
      )
      await open(note.id, origin)
    } catch (e) {
      // antes a falha virava rejeicao sem dono: o botao simplesmente nao fazia nada
      setErroLista(mensagemDeErro(e, 'Não foi possível criar a nota.'))
    }
  }

  return (
    <div ref={panel} className="flex h-full w-80 max-w-[32vw] shrink-0 flex-col border-l bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <StickyNote className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">Notas</span>
        <span className="text-xs text-muted-foreground">
          {documentNotes.length + projectNotes.length}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          data-focus-key="notes-close"
          onClick={() => void run(close)}
          aria-label="Fechar painel de notas"
          title="Fechar painel de notas (Esc)"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {navigationError && <p role="alert" className="p-2 text-xs text-destructive">{navigationError}</p>}
      {erroLista && (
        <p className="border-b bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
          {erroLista}
        </p>
      )}

      {editingNote ? (
        <NoteEditor key={editingNote.id} note={editingNote} onBack={back} />
      ) : (
        <>
          <div className="border-b p-2">
            <input
              data-focus-key="notes-filter"
              data-area-default
              aria-label="Filtrar notas"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar notas…"
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
            {currentDocument && (
              <section>
                <div className="mb-1 flex items-center gap-1">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                    Neste documento
                  </h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-6 px-1"
                    title="Nova nota do documento"
                    data-focus-key="notes-new-document"
                    onClick={() => void handleCreate('document')}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {docScoped.map((n) => (
                    <NoteCard
                      key={n.id}
                      note={n}
                      quote={null}
                      onOpen={() => void run(() => open(n.id))}
                    />
                  ))}
                  {excerptAttached.map((n) => (
                    <NoteCard
                      key={n.id}
                      note={n}
                      quote={quoteOf(n)}
                      onOpen={() => void run(() => open(n.id))}
                    />
                  ))}
                  {docScoped.length === 0 && excerptAttached.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Selecione um trecho no texto para anotá-lo, ou crie uma
                      nota do documento com o + acima.
                    </p>
                  )}
                </div>
              </section>
            )}

            {excerptDetached.length > 0 && (
              <section>
                <div className="mb-1 flex items-center gap-1">
                  <Unlink className="h-3 w-3 text-muted-foreground" />
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                    Desvinculadas
                  </h3>
                </div>
                <div className="space-y-2">
                  {excerptDetached.map((n) => (
                    <NoteCard
                      key={n.id}
                      note={n}
                      quote={quoteOf(n)}
                      onOpen={() => void run(() => open(n.id))}
                    />
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  O trecho foi alterado e a âncora se perdeu. O conteúdo da
                  nota foi preservado.
                </p>
              </section>
            )}

            <section>
              <div className="mb-1 flex items-center gap-1">
                <FolderOpen className="h-3 w-3 text-muted-foreground" />
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                  Projeto
                </h3>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-6 px-1"
                  title="Nova nota do projeto"
                  onClick={() => void handleCreate('project')}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <div className="space-y-2">
                {project.map((n) => (
                  <NoteCard key={n.id} note={n} quote={null} onOpen={() => void run(() => open(n.id))} />
                ))}
                {project.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Memo corrido do projeto: a teoria vai se formando aqui.
                  </p>
                )}
              </div>
            </section>

            {filter.trim() !== '' &&
              docScoped.length === 0 &&
              excerptAttached.length === 0 &&
              excerptDetached.length === 0 &&
              project.length === 0 && (
                <p className="text-center text-xs text-muted-foreground">
                  Nenhuma nota encontrada para “{filter.trim()}”.
                </p>
              )}

            {excerptAttached.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Para ir até o trecho de uma nota, abra a nota e use “Ir para
                o trecho”.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
