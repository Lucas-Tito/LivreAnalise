import { useCallback, useEffect, useRef, useState } from 'react'
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
import { cn } from '@/lib/utils'
import { mensagemDeErro } from '@/lib/erros'
import { aposSalvar, mesmoConteudo } from '@/lib/noteAutosave'
import type { Note } from '@shared/types'

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
  const registerNotesFlush = useAppStore((s) => s.registerNotesFlush)
  const navigateToNote = useAppStore((s) => s.navigateToNote)
  const currentDocument = useAppStore((s) => s.currentDocument)

  const [title, setTitle] = useState(note.title ?? '')
  const [body, setBody] = useState(note.body)
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [erro, setErro] = useState<string | null>(null)
  const stateRef = useRef({ title: note.title ?? '', body: note.body })
  const savedRef = useRef({ title: note.title ?? '', body: note.body })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)

  const updateNoteRef = useRef(updateNote)
  updateNoteRef.current = updateNote

  useEffect(() => {
    setTitle(note.title ?? '')
    setBody(note.body)
    stateRef.current = { title: note.title ?? '', body: note.body }
    savedRef.current = { title: note.title ?? '', body: note.body }
    setStatus('saved')
    // A limpeza grava o que ficou pendente da nota ANTERIOR: ela roda antes do
    // efeito da nota nova e tambem na desmontagem, entao cobre trocar de nota e
    // fechar o painel. Antes o timer era so cancelado, e as teclas digitadas nos
    // ultimos 800ms iam embora sem aviso.
    const idDesteEfeito = note.id
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      const naTela = stateRef.current
      if (mesmoConteudo(naTela, savedRef.current)) return
      void updateNoteRef.current({
        id: idDesteEfeito,
        title: naTela.title.trim() === '' ? null : naTela.title,
        body: naTela.body
      })
    }
  }, [note.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveNow = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const { title: t, body: b } = stateRef.current
    if (mesmoConteudo({ title: t, body: b }, savedRef.current)) {
      setStatus('saved')
      return
    }
    if (savingRef.current) return
    savingRef.current = true
    setStatus('saving')
    try {
      const updated = await updateNote({
        id: note.id,
        title: t.trim() === '' ? null : t,
        body: b
      })
      savedRef.current = { title: updated.title ?? '', body: updated.body }
      // o texto da tela nunca e sobrescrito: o que foi digitado durante o IPC
      // continua valendo e vira um save novo, em vez de sumir como "Salvo"
      const { status: proximo, reagendar } = aposSalvar(stateRef.current, savedRef.current)
      setStatus(proximo)
      if (reagendar) {
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => void saveRef.current(), AUTOSAVE_DELAY)
      }
    } catch {
      setStatus('error')
    } finally {
      savingRef.current = false
    }
  }, [note.id, updateNote])

  const saveRef = useRef(saveNow)
  saveRef.current = saveNow
  useEffect(() => {
    registerNotesFlush(() => saveRef.current())
    return () => registerNotesFlush(null)
  }, [registerNotesFlush])


  const handleChange = (t: string, b: string): void => {
    setTitle(t)
    setBody(b)
    stateRef.current = { title: t, body: b }
    setStatus(
      t === savedRef.current.title && b === savedRef.current.body ? 'saved' : 'dirty'
    )
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void saveRef.current(), AUTOSAVE_DELAY)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void saveRef.current()
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!window.confirm('Apagar esta nota? O conteúdo será perdido.')) return
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      await deleteNote(note.id)
    } catch (e) {
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
        <Button size="sm" variant="ghost" onClick={() => void saveRef.current().then(onBack)}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {status === 'saving' && 'Salvando…'}
          {status === 'saved' && 'Salvo'}
          {status === 'dirty' && 'Alterações não salvas'}
          {status === 'error' && 'Erro ao salvar — tente Ctrl+S'}
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
          value={title}
          onChange={(e) => handleChange(e.target.value, body)}
          placeholder="Título da nota"
          className="mb-2 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <textarea
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

export function NotesPanel(): JSX.Element {
  const currentDocument = useAppStore((s) => s.currentDocument)
  const documentNotes = useAppStore((s) => s.documentNotes)
  const projectNotes = useAppStore((s) => s.projectNotes)
  const editorNoteId = useAppStore((s) => s.editorNoteId)
  const openNoteEditor = useAppStore((s) => s.openNoteEditor)
  const toggleNotesPanel = useAppStore((s) => s.toggleNotesPanel)
  const createNote = useAppStore((s) => s.createNote)
  const [erroLista, setErroLista] = useState<string | null>(null)

  const [filter, setFilter] = useState('')

  const allNotes = [...documentNotes, ...projectNotes]
  const editingNote = allNotes.find((n) => n.id === editorNoteId) ?? null

  const matches = (n: Note): boolean => {
    const f = filter.trim().toLowerCase()
    if (!f) return true
    return (
      (n.title ?? '').toLowerCase().includes(f) || n.body.toLowerCase().includes(f)
    )
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
    try {
      const note = await createNote(
        scope === 'document' && currentDocument
          ? { scope, documentId: currentDocument.id }
          : { scope: 'project' }
      )
      openNoteEditor(note.id)
    } catch (e) {
      // antes a falha virava rejeicao sem dono: o botao simplesmente nao fazia nada
      setErroLista(mensagemDeErro(e, 'Não foi possível criar a nota.'))
    }
  }

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l bg-card">
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
          onClick={toggleNotesPanel}
          title="Fechar painel de notas"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {erroLista && (
        <p className="border-b bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
          {erroLista}
        </p>
      )}

      {editingNote ? (
        <NoteEditor note={editingNote} onBack={() => openNoteEditor(null)} />
      ) : (
        <>
          <div className="border-b p-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar notas…"
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
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
                      onOpen={() => openNoteEditor(n.id)}
                    />
                  ))}
                  {excerptAttached.map((n) => (
                    <NoteCard
                      key={n.id}
                      note={n}
                      quote={quoteOf(n)}
                      onOpen={() => openNoteEditor(n.id)}
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
                      onOpen={() => openNoteEditor(n.id)}
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
                  <NoteCard key={n.id} note={n} quote={null} onOpen={() => openNoteEditor(n.id)} />
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
